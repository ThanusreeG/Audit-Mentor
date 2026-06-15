export type HiddenPracticeProgress = {
  densityLabel: string;
  stageLabel: string;
  detail: string;
  fillPercent: number;
  tone: "idle" | "active" | "near" | "complete";
};

export function buildHiddenPracticeProgress(totalFindings: number, resolvedFindings: number): HiddenPracticeProgress {
  const total = Math.max(0, totalFindings);
  const resolved = Math.min(Math.max(0, resolvedFindings), total);

  if (total === 0) {
    return {
      densityLabel: "No hidden practice set",
      stageLabel: "Ready for report",
      detail: "The analysis did not create a bug-hunting ladder for this contract.",
      fillPercent: 100,
      tone: "complete"
    };
  }

  const densityLabel = total <= 2 ? "Focused hidden set" : total <= 5 ? "Multi-issue hidden set" : "Dense hidden set";

  if (resolved === 0) {
    return {
      densityLabel,
      stageLabel: "Not started",
      detail: "The exact finding count stays hidden until the final report.",
      fillPercent: 10,
      tone: "idle"
    };
  }

  if (resolved === total) {
    return {
      densityLabel,
      stageLabel: "Complete",
      detail: "The hidden practice set is complete. The report can now show exact totals.",
      fillPercent: 100,
      tone: "complete"
    };
  }

  const ratio = resolved / total;
  if (ratio < 0.34) {
    return {
      densityLabel,
      stageLabel: "Underway",
      detail: "You have cleared the opening part of the hidden set.",
      fillPercent: 35,
      tone: "active"
    };
  }

  if (ratio < 0.67) {
    return {
      densityLabel,
      stageLabel: "Middle stretch",
      detail: "You are moving through the hidden set without seeing the exact total.",
      fillPercent: 60,
      tone: "active"
    };
  }

  return {
    densityLabel,
    stageLabel: "Nearing finish",
    detail: "Most of the hidden set is behind you. Keep working through the hint ladder.",
    fillPercent: 82,
    tone: "near"
  };
}
