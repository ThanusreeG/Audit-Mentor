import { prisma } from "@/lib/db";
import { classifyContractType } from "@/lib/localAnalysis";
import { buildHiddenPracticeProgress } from "@/lib/practice-progress";
import { detectSignals } from "@/lib/signals";

export type AuditSessionView = {
  sessionId: string;
  contractType: string;
  riskScore: number;
  features: {
    handlesFunds: boolean;
    externalCalls: boolean;
    tokenTransfers: boolean;
    accessControl: boolean;
    signatures: boolean;
    oracle: boolean;
    upgradeable: boolean;
    complexAccounting: boolean;
  };
  lineCount: number;
  initialProgress: ReturnType<typeof buildHiddenPracticeProgress>;
};

export async function getAuditSessionView(sessionId: string): Promise<AuditSessionView | null> {
  const session = await prisma.auditSession.findUnique({
    where: { id: sessionId }
  });

  if (!session) return null;

  const [totalFindings, resolvedFindings] = await Promise.all([
    prisma.vulnerability.count({ where: { sessionId: session.id } }),
    prisma.vulnerability.count({ where: { sessionId: session.id, resolved: true } })
  ]);
  const detectedSignals = parseJson<Record<string, unknown>>(session.detectedSignals, {});
  const features = parseFeatureFlags(detectedSignals);
  const lineCount = typeof detectedSignals.lineCount === "number" ? detectedSignals.lineCount : session.contractSource.split(/\r?\n/).length;
  const contractType =
    session.contractType && session.contractType !== "Unknown"
      ? session.contractType
      : classifyContractType(session.contractSource, detectSignals(session.contractSource));

  return {
    sessionId: session.id,
    contractType,
    riskScore: session.riskScore || 1,
    features,
    lineCount,
    initialProgress: buildHiddenPracticeProgress(totalFindings, resolvedFindings)
  };
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseFeatureFlags(detectedSignals: Record<string, unknown>) {
  const nested = typeof detectedSignals.features === "object" && detectedSignals.features ? detectedSignals.features : detectedSignals;
  const features = nested as Record<string, unknown>;

  return {
    handlesFunds: Boolean(features.handlesFunds ?? detectedSignals.handlesFunds),
    externalCalls: Boolean(features.externalCalls),
    tokenTransfers: Boolean(features.tokenTransfers),
    accessControl: Boolean(features.accessControl),
    signatures: Boolean(features.signatures),
    oracle: Boolean(features.oracle),
    upgradeable: Boolean(features.upgradeable),
    complexAccounting: Boolean(features.complexAccounting)
  };
}
