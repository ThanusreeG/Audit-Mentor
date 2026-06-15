import type { DetectedSignals } from "./signals";

export function computeRiskScore(signals: DetectedSignals) {
  let score = 3;

  if (signals.holdsFunds) score += 2;
  if (signals.externalCalls) score += 1;
  if (signals.tokenTransfers) score += 1;
  if (signals.signatures) score += 1.5;
  if (signals.oracle) score += 1.5;
  if (signals.upgradeable) score += 1;
  if (signals.complexAccounting) score += 1;
  if (signals.accessControl) score += 1;
  if (!signals.accessControl && (signals.holdsFunds || signals.tokenTransfers || signals.externalCalls)) score += 2;
  if (signals.safeLibsUsed) score -= 0.5;
  if (signals.hasChecks && signals.checksCount >= 2) score -= 0.5;

  return Math.max(1, Math.min(10, Number(score.toFixed(1))));
}
