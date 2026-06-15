import { createHash } from "node:crypto";
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

type FeatureFlags = ReturnType<typeof publicFeatureFlags>;

type AnalysisMode = "llm-aggregate" | "cache-hit" | "local-fallback";

type NormalizedAuditAnalysis = {
  contractType: string;
  handlesFunds: boolean;
  summary: string;
  riskScore: number;
  features: FeatureFlags;
  vulnerabilities: VulnerabilityResult["vulnerabilities"];
  riskReasonCategories: string[];
  lineCount: number;
};

type AnalysisCachePayload = {
  version: 1;
  contractHash: string;
  generatedAt: string;
  scanCount: number;
  successfulScans: number;
  failedScans: number;
  analysis: NormalizedAuditAnalysis;
};

const AGGREGATE_SCAN_COUNT = 3;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    contractSource?: string;
    source?: string;
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
  const canonicalContractSource = canonicalizeContractSource(contractSource);
  const contractHash = sha256(canonicalContractSource);

  const cached = await prisma.analysisCache.findUnique({
    where: { contractHash }
  });
  const cachedPayload = cached ? parseAnalysisCachePayload(cached.responseJson, contractHash) : null;
  if (cached && cachedPayload) {
    const session = await createSession({
      contractSource,
      contractHash,
      analysisCacheId: cached.id,
      contractType: cachedPayload.analysis.contractType,
      handlesFunds: cachedPayload.analysis.handlesFunds,
      summary: cachedPayload.analysis.summary,
      riskScore: cachedPayload.analysis.riskScore,
      vulnerabilities: cachedPayload.analysis.vulnerabilities,
      signals,
      features: cachedPayload.analysis.features,
      lineCount: cachedPayload.analysis.lineCount,
      analysisMode: "cache-hit",
      riskReasonCategories: [
        "Cached aggregate analysis reused for this source hash; no new LLM scan was run.",
        ...cachedPayload.analysis.riskReasonCategories
      ]
    });

    return analysisResponse({
      sessionId: session.id,
      normalized: cachedPayload.analysis,
      lineCount: cachedPayload.analysis.lineCount,
      analysisMode: "cache-hit",
      cached: true,
      contractHash,
      cacheGeneratedAt: cachedPayload.generatedAt
    });
  }

  try {
    const aggregate = await runAggregateLlmAnalysis({
      contractSource,
      signals,
      localContractType,
      localRiskScore,
      lineCount
    });
    const cachePayload = buildAnalysisCachePayload({
      contractHash,
      aggregate
    });
    const analysisCache = await prisma.analysisCache.upsert({
      where: { contractHash },
      create: {
        contractHash,
        contractSource: canonicalContractSource,
        analysisMode: "llm-aggregate",
        responseJson: JSON.stringify(cachePayload)
      },
      update: {
        contractSource: canonicalContractSource,
        analysisMode: "llm-aggregate",
        responseJson: JSON.stringify(cachePayload)
      }
    });

    const session = await createSession({
      contractSource,
      contractHash,
      analysisCacheId: analysisCache.id,
      contractType: aggregate.analysis.contractType,
      handlesFunds: aggregate.analysis.handlesFunds,
      summary: aggregate.analysis.summary,
      riskScore: aggregate.analysis.riskScore,
      vulnerabilities: aggregate.analysis.vulnerabilities,
      signals,
      features: aggregate.analysis.features,
      lineCount: aggregate.analysis.lineCount,
      analysisMode: "llm-aggregate",
      riskReasonCategories: aggregate.analysis.riskReasonCategories
    });

    return analysisResponse({
      sessionId: session.id,
      normalized: aggregate.analysis,
      lineCount: aggregate.analysis.lineCount,
      analysisMode: "llm-aggregate",
      cached: false,
      contractHash,
      aggregateScans: {
        requested: AGGREGATE_SCAN_COUNT,
        successful: aggregate.successfulScans,
        failed: aggregate.failedScans
      }
    });
  } catch (error) {
    console.error("[analyze] LLM analysis failed; using local fallback", error);
    const contractType = localContractType;
    const riskScore = localRiskScore;
    const vulnerabilities = detectLocalVulnerabilities(contractSource, contractType);
    const handlesFunds = signals.holdsFunds || signals.tokenTransfers;

    const session = await createSession({
      contractSource,
      contractHash,
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

    return analysisResponse({
      sessionId: session.id,
      normalized: {
        contractType,
        handlesFunds,
        summary: `LLM analysis failed, so local fallback classified this as a ${contractType} contract.`,
        riskScore,
        features: publicFeatureFlags(signals, handlesFunds),
        vulnerabilities,
        riskReasonCategories: ["LLM analysis unavailable; local fallback used."],
        lineCount
      },
      lineCount,
      analysisMode: "local-fallback",
      cached: false,
      contractHash,
      notice: llmFailureMessage(error)
    });
  }
}

async function runAggregateLlmAnalysis({
  contractSource,
  signals,
  localContractType,
  localRiskScore,
  lineCount
}: {
  contractSource: string;
  signals: DetectedSignals;
  localContractType: string;
  localRiskScore: number;
  lineCount: number;
}) {
  const attempts = await Promise.allSettled(
    Array.from({ length: AGGREGATE_SCAN_COUNT }, (_, index) =>
      runSingleLlmAnalysis({
        contractSource,
        signals,
        localContractType,
        localRiskScore,
        lineCount,
        scanNumber: index + 1
      })
    )
  );
  const fulfilled = attempts
    .filter((attempt): attempt is PromiseFulfilledResult<NormalizedAuditAnalysis> => attempt.status === "fulfilled")
    .map((attempt) => attempt.value);

  if (!fulfilled.length) {
    const firstError = attempts.find((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected")?.reason;
    throw firstError instanceof Error ? firstError : new Error("All aggregate LLM scans failed.");
  }

  const failedScans = attempts.length - fulfilled.length;
  return {
    analysis: aggregateAnalyses(fulfilled, signals, localContractType, localRiskScore, lineCount, failedScans),
    successfulScans: fulfilled.length,
    failedScans
  };
}

async function runSingleLlmAnalysis({
  contractSource,
  signals,
  localContractType,
  localRiskScore,
  lineCount,
  scanNumber
}: {
  contractSource: string;
  signals: DetectedSignals;
  localContractType: string;
  localRiskScore: number;
  lineCount: number;
  scanNumber: number;
}) {
  const llmAnalysis = await callLLMJson<LlmAuditAnalysis>(
    [
      { role: "system", content: fullAuditAnalysisSystemPrompt },
      {
        role: "user",
        content: `Analyze this Solidity contract for the audit training app.

This is aggregate scan ${scanNumber} of ${AGGREGATE_SCAN_COUNT}. Be concrete. Report only credible vulnerabilities that are grounded in the provided source. Do not invent issues just to increase the count.

Solidity source:
${contractSource}`
      }
    ],
    {
      route: `analyze:aggregate-${scanNumber}`,
      callerTag: `analyze:aggregate-${scanNumber}`,
      temperature: 0.1,
      maxTokens: 4000,
      timeoutMs: 90_000,
      retries: 0
    }
  );

  return normalizeLlmAnalysis(llmAnalysis, signals, localContractType, localRiskScore, lineCount);
}

function aggregateAnalyses(
  analyses: NormalizedAuditAnalysis[],
  localSignals: DetectedSignals,
  localContractType: string,
  localRiskScore: number,
  lineCount: number,
  failedScans: number
): NormalizedAuditAnalysis {
  const bestAnalysis = analyses.reduce((best, current) =>
    current.vulnerabilities.length > best.vulnerabilities.length ? current : best
  );
  const handlesFunds = analyses.some((analysis) => analysis.handlesFunds);
  const fallbackFeatures = publicFeatureFlags(localSignals, handlesFunds);
  const features: FeatureFlags = {
    handlesFunds,
    externalCalls: analyses.some((analysis) => analysis.features.externalCalls) || fallbackFeatures.externalCalls,
    tokenTransfers: analyses.some((analysis) => analysis.features.tokenTransfers) || fallbackFeatures.tokenTransfers,
    accessControl: analyses.some((analysis) => analysis.features.accessControl) || fallbackFeatures.accessControl,
    signatures: analyses.some((analysis) => analysis.features.signatures) || fallbackFeatures.signatures,
    oracle: analyses.some((analysis) => analysis.features.oracle) || fallbackFeatures.oracle,
    upgradeable: analyses.some((analysis) => analysis.features.upgradeable) || fallbackFeatures.upgradeable,
    complexAccounting: analyses.some((analysis) => analysis.features.complexAccounting) || fallbackFeatures.complexAccounting
  };
  const vulnerabilities = mergeVulnerabilities(analyses.flatMap((analysis) => analysis.vulnerabilities));
  const riskScore = clampRiskScore(
    Math.max(localRiskScore, ...analyses.map((analysis) => analysis.riskScore)),
    vulnerabilities.length,
    features
  );
  const riskReasonCategories = uniqueStrings([
    `Aggregate analysis combined ${analyses.length} successful LLM scan${analyses.length === 1 ? "" : "s"}${failedScans ? `; ${failedScans} scan${failedScans === 1 ? "" : "s"} failed` : ""}.`,
    ...analyses.flatMap((analysis) => analysis.riskReasonCategories)
  ]).slice(0, 8);

  return {
    contractType: chooseContractType(analyses.map((analysis) => analysis.contractType), localContractType),
    handlesFunds,
    summary:
      bestAnalysis.summary ||
      `Aggregate LLM analysis classified this as a ${chooseContractType(
        analyses.map((analysis) => analysis.contractType),
        localContractType
      )} contract with ${lineCount} lines.`,
    riskScore,
    features,
    vulnerabilities,
    riskReasonCategories,
    lineCount
  };
}

function mergeVulnerabilities(vulnerabilities: VulnerabilityResult["vulnerabilities"]) {
  const merged: VulnerabilityResult["vulnerabilities"] = [];
  for (const vulnerability of vulnerabilities) {
    const existingIndex = merged.findIndex((item) => sameFinding(item, vulnerability));
    if (existingIndex === -1) {
      merged.push(vulnerability);
      continue;
    }

    merged[existingIndex] = mergeFinding(merged[existingIndex], vulnerability);
  }

  return merged.sort(compareSeverity).slice(0, 12);
}

function sameFinding(a: VulnerabilityResult["vulnerabilities"][number], b: VulnerabilityResult["vulnerabilities"][number]) {
  const aTitle = titleKey(a.title);
  const bTitle = titleKey(b.title);
  if (aTitle && aTitle === bTitle) return true;

  const aSnippet = snippetKey(a.codeSnippet);
  const bSnippet = snippetKey(b.codeSnippet);
  if (aSnippet && bSnippet && (aSnippet === bSnippet || aSnippet.includes(bSnippet) || bSnippet.includes(aSnippet))) {
    return tokenOverlap(a.title, b.title) >= 0.35;
  }

  const aKeywords = new Set(normalizeKeywordList(a.matchKeywords));
  const bKeywords = new Set(normalizeKeywordList(b.matchKeywords));
  const sharedKeywords = Array.from(aKeywords).filter((keyword) => bKeywords.has(keyword)).length;
  return sharedKeywords >= 3 && tokenOverlap(a.title, b.title) >= 0.4;
}

function mergeFinding(a: VulnerabilityResult["vulnerabilities"][number], b: VulnerabilityResult["vulnerabilities"][number]) {
  const preferred = findingCompletenessScore(b) > findingCompletenessScore(a) ? b : a;
  const alternate = preferred === a ? b : a;
  return {
    ...preferred,
    severity: strongerSeverity(preferred.severity, alternate.severity),
    matchKeywords: uniqueStrings([...normalizeKeywordList(preferred.matchKeywords), ...normalizeKeywordList(alternate.matchKeywords)]).slice(0, 20)
  };
}

function findingCompletenessScore(vulnerability: VulnerabilityResult["vulnerabilities"][number]) {
  return [
    vulnerability.title,
    vulnerability.codeSnippet,
    vulnerability.explanation,
    vulnerability.attackScenario,
    vulnerability.impact,
    vulnerability.fix,
    vulnerability.learningNote,
    vulnerability.hint1,
    vulnerability.hint2,
    vulnerability.hint3
  ].join(" ").length;
}

function compareSeverity(a: VulnerabilityResult["vulnerabilities"][number], b: VulnerabilityResult["vulnerabilities"][number]) {
  return severityRank(b.severity) - severityRank(a.severity);
}

function strongerSeverity(a: string, b: string) {
  return severityRank(b) > severityRank(a) ? normalizeSeverity(b) : normalizeSeverity(a);
}

function severityRank(severity: string) {
  const normalized = normalizeSeverity(severity);
  if (normalized === "Critical") return 5;
  if (normalized === "High") return 4;
  if (normalized === "Medium") return 3;
  if (normalized === "Low") return 2;
  return 1;
}

function chooseContractType(types: string[], fallback: string) {
  const counts = new Map<string, number>();
  for (const type of types.map(normalizeContractType).filter((type) => type !== "Unknown")) {
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] || normalizeContractType(fallback);
}

function tokenOverlap(a: string, b: string) {
  const aTokens = new Set(significantTokens(a));
  const bTokens = new Set(significantTokens(b));
  if (!aTokens.size || !bTokens.size) return 0;
  const shared = Array.from(aTokens).filter((token) => bTokens.has(token)).length;
  return shared / Math.min(aTokens.size, bTokens.size);
}

function significantTokens(value: string) {
  return Array.from(value.toLowerCase().matchAll(/\b[a-z][a-z0-9]{2,}\b/g), ([token]) => token).filter((token) => !STOP_WORDS.has(token));
}

function titleKey(value: string) {
  return significantTokens(value).join("-");
}

function snippetKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9_{}()[\].,;:=+\-*/<>!&| ]/g, "")
    .trim()
    .slice(0, 240);
}

function normalizeKeywordList(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((keyword) => keyword.trim().toLowerCase()).filter(Boolean) : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildAnalysisCachePayload({
  contractHash,
  aggregate
}: {
  contractHash: string;
  aggregate: { analysis: NormalizedAuditAnalysis; successfulScans: number; failedScans: number };
}): AnalysisCachePayload {
  return {
    version: 1,
    contractHash,
    generatedAt: new Date().toISOString(),
    scanCount: AGGREGATE_SCAN_COUNT,
    successfulScans: aggregate.successfulScans,
    failedScans: aggregate.failedScans,
    analysis: aggregate.analysis
  };
}

function parseAnalysisCachePayload(value: string, expectedHash: string): AnalysisCachePayload | null {
  try {
    const parsed = JSON.parse(value) as AnalysisCachePayload;
    if (parsed?.version !== 1 || parsed.contractHash !== expectedHash || !parsed.analysis) return null;
    return parsed;
  } catch {
    return null;
  }
}

function analysisResponse({
  sessionId,
  normalized,
  lineCount,
  analysisMode,
  cached,
  contractHash,
  aggregateScans,
  cacheGeneratedAt,
  notice
}: {
  sessionId: string;
  normalized: NormalizedAuditAnalysis;
  lineCount: number;
  analysisMode: AnalysisMode;
  cached: boolean;
  contractHash: string;
  aggregateScans?: { requested: number; successful: number; failed: number };
  cacheGeneratedAt?: string;
  notice?: string;
}) {
  return NextResponse.json({
    ok: true,
    sessionId,
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
    analysisMode,
    cached,
    contractHash,
    aggregateScans,
    cacheGeneratedAt,
    notice
  });
}

async function createSession({
  contractSource,
  contractHash,
  analysisCacheId,
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
  contractHash: string;
  analysisCacheId?: string;
  contractType: string;
  handlesFunds: boolean;
  summary: string;
  riskScore: number;
  vulnerabilities: VulnerabilityResult["vulnerabilities"];
  signals: DetectedSignals;
  features: FeatureFlags;
  lineCount: number;
  analysisMode: AnalysisMode;
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
  const detectedMetadata = { localSignals: signals, features, handlesFunds, summary, lineCount, analysisMode, contractHash, analysisCacheId };
  const session = await prisma.auditSession.create({
    data: {
      contractHash,
      contractSource,
      contractType,
      riskScore,
      riskReasons: JSON.stringify(riskReasonCategories),
      detectedSignals: JSON.stringify(detectedMetadata),
      analysisCacheId,
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
      : [],
    lineCount
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

function canonicalizeContractSource(source: string) {
  return source.replace(/\r\n?/g, "\n").trim();
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
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
