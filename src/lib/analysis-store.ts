import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AnalysisArtifactFinding = {
  ordinal: number;
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
};

export type AnalysisArtifact = {
  version: 1;
  sessionId: string;
  savedAt: string;
  sourceHash: string;
  contractType: string;
  handlesFunds: boolean;
  summary: string;
  riskScore: number;
  features: Record<string, boolean>;
  lineCount: number;
  analysisMode: "llm" | "local-fallback";
  riskReasonCategories: string[];
  hiddenFindingCount: number;
  vulnerabilities: AnalysisArtifactFinding[];
};

export async function saveAnalysisArtifact({
  sessionId,
  contractSource,
  contractType,
  handlesFunds,
  summary,
  riskScore,
  features,
  lineCount,
  analysisMode,
  riskReasonCategories,
  vulnerabilities
}: Omit<AnalysisArtifact, "version" | "savedAt" | "sourceHash" | "hiddenFindingCount"> & { contractSource: string }) {
  const artifact: AnalysisArtifact = {
    version: 1,
    sessionId,
    savedAt: new Date().toISOString(),
    sourceHash: createHash("sha256").update(contractSource).digest("hex"),
    contractType,
    handlesFunds,
    summary,
    riskScore,
    features,
    lineCount,
    analysisMode,
    riskReasonCategories,
    hiddenFindingCount: vulnerabilities.length,
    vulnerabilities
  };

  const filePath = artifactPath(sessionId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return { artifact, relativePath: path.relative(process.cwd(), filePath) };
}

export async function loadAnalysisArtifact(sessionId: string): Promise<AnalysisArtifact | null> {
  try {
    const raw = await readFile(artifactPath(sessionId), "utf8");
    const parsed = JSON.parse(raw) as AnalysisArtifact;
    return parsed?.version === 1 && parsed.sessionId === sessionId ? parsed : null;
  } catch {
    return null;
  }
}

function artifactPath(sessionId: string) {
  const configured = process.env.ANALYSIS_ARTIFACT_DIR || ".audit-analysis";
  const directory = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  return path.join(directory, `${safeFilePart(sessionId)}.json`);
}

function safeFilePart(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}
