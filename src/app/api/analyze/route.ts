import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveAnalysisArtifact, type AnalysisArtifactFinding } from "@/lib/analysis-store";
import { validateSingleConcreteContract } from "@/lib/contract-validation";
import { classifyContractType, detectLocalVulnerabilities } from "@/lib/localAnalysis";
import { callLLMJson, LlmError } from "@/lib/llm";
import { fullAuditAnalysisSystemPrompt } from "@/lib/prompts";
import { computeRiskScore } from "@/lib/riskScore";
import { detectSignals, type DetectedSignals } from "@/lib/signals";

type VulnerabilityResult = {
  vulnerabilities: Array<{
    title: string;
    severity: string;
    codeSnippet: string;
    explanation: string;
    attackScenario: string;
    impact: string;
    fix: string;
    learningNote: string;
    hint1: string;
    hint2: string;
    hint3: string;
    matchKeywords: string[];
  }>;
};

type LlmAuditAnalysis = {
  contractType?: string;
  handlesFunds?: boolean;
  summary?: string;
  riskScore?: number;
  features?: Partial<Record<keyof ReturnType<typeof publicFeatureFlags>, boolean>>;
  riskReasonCategories?: string[];
  vulnerabilities?: VulnerabilityResult["vulnerabilities"];
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    contractSource?: string;
    source?: string;
    llmBaseUrl?: string;
  } | null;
  const contractSource = body?.contractSource || body?.source || "";

  if (contractSource.trim().length < 40) {
    return NextResponse.json({ ok: false, error: "Paste a Solidity contract before analyzing." }, { status: 400 });
  }

  const contractValidation = validateSingleConcreteContract(contractSource);
  if (!contractValidation.ok) {
    return NextResponse.json({ ok: false, error: contractValidation.error }, { status: 400 });
  }

  const signals = detectSignals(contractSource);
  const lineCount = contractSource.split(/\r?\n/).length;
  const localContractType = classifyContractType(contractSource, signals);
  const localRiskScore = computeRiskScore(signals);

  try {
    const llmAnalysis = await callLLMJson<LlmAuditAnalysis>(
      [
        { role: "system", content: fullAuditAnalysisSystemPrompt },
        {
          role: "user",
          content: `Analyze this Solidity contract for the audit training app.

Solidity source:
${contractSource}`
        }
      ],
      {
        route: "analyze",
        callerTag: "analyze",
        temperature: 0.1,
        maxTokens: 4000,
        timeoutMs: 90_000,
        retries: 0,
        baseUrl: body?.llmBaseUrl
      }
    );

    const normalized = normalizeLlmAnalysis(llmAnalysis, signals, localContractType, localRiskScore, lineCount);
    const session = await createSession({
      contractSource,
      contractType: normalized.contractType,
      handlesFunds: normalized.handlesFunds,
      summary: normalized.summary,
      riskScore: normalized.riskScore,
      vulnerabilities: normalized.vulnerabilities,
      signals,
      features: normalized.features,
      lineCount,
      analysisMode: "llm",
      riskReasonCategories: normalized.riskReasonCategories
    });

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      analysis: {
        score: normalized.riskScore,
        contractType: normalized.contractType,
        features: normalized.features,
        lines: lineCount
      },
      contractType: normalized.contractType,
      handlesFunds: normalized.handlesFunds,
      riskScore: normalized.riskScore,
      signals: normalized.features,
      lineCount,
      analysisMode: "llm"
    });
  } catch (error) {
    console.error("[analyze] LLM analysis failed; using local fallback", error);
    const contractType = localContractType;
    const riskScore = localRiskScore;
    const vulnerabilities = detectLocalVulnerabilities(contractSource, contractType);
    const handlesFunds = signals.holdsFunds || signals.tokenTransfers;

    const session = await createSession({
      contractSource,
      contractType,
      handlesFunds,
      summary: `LLM analysis failed, so local fallback classified this as a ${contractType} contract.`,
      riskScore,
      vulnerabilities,
      signals,
      features: publicFeatureFlags(signals, handlesFunds),
      lineCount,
      analysisMode: "local-fallback",
      riskReasonCategories: ["LLM analysis unavailable; local fallback used."]
    });

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      analysis: {
        score: riskScore,
        contractType,
        features: publicFeatureFlags(signals, handlesFunds),
        lines: lineCount
      },
      contractType,
      handlesFunds,
      riskScore,
      signals,
      lineCount,
      analysisMode: "local-fallback",
      notice: llmFailureMessage(error)
    });
  }
}

async function createSession({
  contractSource,
  contractType,
  handlesFunds,
  summary,
  riskScore,
  vulnerabilities,
  signals,
  features,
  lineCount,
  analysisMode,
  riskReasonCategories
}: {
  contractSource: string;
  contractType: string;
  handlesFunds: boolean;
  summary: string;
  riskScore: number;
  vulnerabilities: VulnerabilityResult["vulnerabilities"];
  signals: DetectedSignals;
  features: ReturnType<typeof publicFeatureFlags>;
  lineCount: number;
  analysisMode: "llm" | "local-fallback";
  riskReasonCategories: string[];
}) {
  const storedFindings: AnalysisArtifactFinding[] = (vulnerabilities || []).map((vulnerability, index) => {
    const matchKeywords = normalizeMatchKeywords(vulnerability);

    return {
      ordinal: index + 1,
      title: vulnerability.title,
      severity: vulnerability.severity,
      codeSnippet: vulnerability.codeSnippet,
      explanation: vulnerability.explanation,
      attackScenario: vulnerability.attackScenario,
      impact: vulnerability.impact,
      fix: vulnerability.fix,
      learningNote: vulnerability.learningNote,
      hint1: vulnerability.hint1,
      hint2: vulnerability.hint2,
      hint3: vulnerability.hint3,
      matchKeywords
    };
  });
  const detectedMetadata = { localSignals: signals, features, handlesFunds, summary, lineCount, analysisMode };
  const session = await prisma.auditSession.create({
    data: {
      contractSource,
      contractType,
      riskScore,
      riskReasons: JSON.stringify(riskReasonCategories),
      detectedSignals: JSON.stringify(detectedMetadata),
      vulnerabilities: {
        create: storedFindings.map((vulnerability) => ({
          ordinal: vulnerability.ordinal,
          title: vulnerability.title,
          severity: vulnerability.severity,
          codeSnippet: vulnerability.codeSnippet,
          explanation: vulnerability.explanation,
          attackScenario: vulnerability.attackScenario,
          impact: vulnerability.impact,
          fix: vulnerability.fix,
          learningNote: vulnerability.learningNote,
          hint1: vulnerability.hint1,
          hint2: vulnerability.hint2,
          hint3: vulnerability.hint3,
          matchKeywords: JSON.stringify(vulnerability.matchKeywords)
        }))
      }
    },
    include: { vulnerabilities: true }
  });

  try {
    const saved = await saveAnalysisArtifact({
      sessionId: session.id,
      contractSource,
      contractType,
      handlesFunds,
      summary,
      riskScore,
      features,
      lineCount,
      analysisMode,
      riskReasonCategories,
      vulnerabilities: storedFindings
    });

    await prisma.auditSession.update({
      where: { id: session.id },
      data: {
        detectedSignals: JSON.stringify({ ...detectedMetadata, analysisArtifactPath: saved.relativePath })
      }
    });
  } catch (error) {
    console.error("[analyze] Could not save backend analysis artifact", error);
  }

  return session;
}

function normalizeLlmAnalysis(
  analysis: LlmAuditAnalysis,
  localSignals: DetectedSignals,
  localContractType: string,
  localRiskScore: number,
  lineCount: number
) {
  const contractType = normalizeContractType(analysis.contractType || localContractType);
  const handlesFunds = Boolean(analysis.handlesFunds ?? localSignals.holdsFunds ?? localSignals.tokenTransfers);
  const fallbackFeatures = publicFeatureFlags(localSignals, handlesFunds);
  const features = {
    handlesFunds,
    externalCalls: Boolean(analysis.features?.externalCalls ?? fallbackFeatures.externalCalls),
    tokenTransfers: Boolean(analysis.features?.tokenTransfers ?? fallbackFeatures.tokenTransfers),
    accessControl: Boolean(analysis.features?.accessControl ?? fallbackFeatures.accessControl),
    signatures: Boolean(analysis.features?.signatures ?? fallbackFeatures.signatures),
    oracle: Boolean(analysis.features?.oracle ?? fallbackFeatures.oracle),
    upgradeable: Boolean(analysis.features?.upgradeable ?? fallbackFeatures.upgradeable),
    complexAccounting: Boolean(analysis.features?.complexAccounting ?? fallbackFeatures.complexAccounting)
  };
  const vulnerabilities = normalizeVulnerabilities(analysis.vulnerabilities || []);
  const riskScore = clampRiskScore(
    typeof analysis.riskScore === "number" && Number.isFinite(analysis.riskScore) ? analysis.riskScore : localRiskScore,
    vulnerabilities.length,
    features
  );

  return {
    contractType,
    handlesFunds,
    summary:
      typeof analysis.summary === "string" && analysis.summary.trim()
        ? analysis.summary.trim()
        : `The LLM classified this as a ${contractType} contract with ${lineCount} lines.`,
    riskScore,
    features,
    vulnerabilities,
    riskReasonCategories: Array.isArray(analysis.riskReasonCategories)
      ? analysis.riskReasonCategories.map(String).filter(Boolean).slice(0, 6)
      : []
  };
}

function publicFeatureFlags(signals: DetectedSignals, handlesFunds: boolean) {
  return {
    handlesFunds,
    externalCalls: signals.externalCalls,
    tokenTransfers: signals.tokenTransfers,
    accessControl: signals.accessControl,
    signatures: signals.signatures,
    oracle: signals.oracle,
    upgradeable: signals.upgradeable,
    complexAccounting: signals.complexAccounting
  };
}

function normalizeContractType(value: string) {
  const allowed = new Set([
    "Bridge",
    "Staking",
    "Escrow",
    "Token",
    "NFT",
    "Oracle",
    "Governance",
    "Vault",
    "Lending",
    "Payment",
    "AccessControl",
    "Registry",
    "Utility",
    "Unknown"
  ]);
  const cleaned = value.trim();
  const matched = Array.from(allowed).find((item) => item.toLowerCase() === cleaned.toLowerCase());
  return matched || "Unknown";
}

function normalizeVulnerabilities(vulnerabilities: VulnerabilityResult["vulnerabilities"]) {
  if (!Array.isArray(vulnerabilities)) return [];
  return vulnerabilities
    .filter((vulnerability) => vulnerability && typeof vulnerability.title === "string" && vulnerability.title.trim())
    .map((vulnerability, index) => {
      const title = clean(vulnerability.title, `Finding ${index + 1}`);
      return {
        title,
        severity: normalizeSeverity(vulnerability.severity),
        codeSnippet: clean(vulnerability.codeSnippet, "Relevant code snippet was not returned by the LLM."),
        explanation: clean(vulnerability.explanation, "The LLM marked this as suspicious but did not provide a full explanation."),
        attackScenario: clean(vulnerability.attackScenario, "An attacker may abuse this behavior depending on deployment context."),
        impact: clean(vulnerability.impact, "Impact depends on how funds or permissions are used in production."),
        fix: clean(vulnerability.fix, "Review the logic and add the appropriate checks or accounting protections."),
        learningNote: clean(vulnerability.learningNote, "Connect the code path to who can call it, what state changes, and where funds move."),
        hint1: clean(vulnerability.hint1, "Start by tracing who can call this code path and what state or funds it affects."),
        hint2: clean(vulnerability.hint2, `Look more closely at the mechanism behind ${title}.`),
        hint3: clean(vulnerability.hint3, "The issue is in the relationship between this code path, trust assumptions, and state changes."),
        matchKeywords: Array.isArray(vulnerability.matchKeywords) ? vulnerability.matchKeywords.map(String) : []
      };
    })
    .slice(0, 12);
}

function normalizeSeverity(value: string) {
  const severity = clean(value, "Medium");
  const allowed = new Set(["Critical", "High", "Medium", "Low", "Informational"]);
  return allowed.has(severity) ? severity : "Medium";
}

function clean(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampRiskScore(score: number, vulnerabilityCount: number, features: ReturnType<typeof publicFeatureFlags>) {
  void vulnerabilityCount;
  void features;
  return Math.round(Math.min(10, Math.max(1, score)) * 10) / 10;
}

function llmFailureMessage(error: unknown) {
  if (error instanceof LlmError) return `LLM analysis failed: ${error.detail}`;
  return error instanceof Error ? `LLM analysis failed: ${error.message}` : "LLM analysis failed.";
}

function normalizeMatchKeywords(vulnerability: VulnerabilityResult["vulnerabilities"][number]) {
  const provided = Array.isArray(vulnerability.matchKeywords) ? vulnerability.matchKeywords : [];
  const cleaned = provided.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean);
  if (cleaned.length >= 3) return [...new Set(cleaned)];

  const haystack = [vulnerability.title, vulnerability.codeSnippet, vulnerability.explanation].join(" ");
  const identifiers = Array.from(haystack.matchAll(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g))
    .map(([word]) => word.toLowerCase())
    .filter((word) => !STOP_WORDS.has(word));

  const domainKeywords = DOMAIN_KEYWORDS.filter((keyword) => haystack.toLowerCase().includes(keyword));
  return [...new Set([...cleaned, ...domainKeywords, ...identifiers])].slice(0, 16);
}

const DOMAIN_KEYWORDS = [
  "access control",
  "onlyowner",
  "owner",
  "signer",
  "signature",
  "replay",
  "chainid",
  "nonce",
  "claim",
  "transfer",
  "transferfrom",
  "safetransfer",
  "reentrancy",
  "oracle",
  "price",
  "stale",
  "delegatecall",
  "initialize",
  "upgrade",
  "slippage",
  "shares",
  "accounting"
];

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "function",
  "external",
  "public",
  "private",
  "internal",
  "returns",
  "return",
  "contract",
  "address",
  "uint256",
  "string",
  "bool",
  "true",
  "false",
  "allows",
  "caller",
  "vulnerability",
  "attacker",
  "users"
]);
