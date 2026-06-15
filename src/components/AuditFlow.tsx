"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import type { HiddenPracticeProgress } from "@/lib/practice-progress";
import FinalReport from "./FinalReport";
import HintCard from "./HintCard";
import ReadingGuide from "./ReadingGuide";
import RevealCard from "./RevealCard";
import RiskScoreBadge from "./RiskScoreBadge";
import Stepper from "./Stepper";
import SummaryBox from "./SummaryBox";

type Reveal = {
  ordinal: number;
  title: string;
  severity: string;
  codeSnippet: string;
  explanation: string;
  attackScenario: string;
  impact: string;
  fix: string;
  learningNote: string;
  identifiedByUser: boolean;
};

type Report = Parameters<typeof FinalReport>[0]["report"];
type RevealReason = "correct" | "wrong" | "blank" | "manual";
type Verdict = {
  kind: "correct" | "wrong";
  reasoning: string;
  source?: string;
};
type FeatureFlags = {
  handlesFunds?: boolean;
  externalCalls?: boolean;
  tokenTransfers?: boolean;
  accessControl?: boolean;
  signatures?: boolean;
  oracle?: boolean;
  upgradeable?: boolean;
  complexAccounting?: boolean;
};

export default function AuditFlow({
  sessionId,
  contractType,
  riskScore,
  features,
  lineCount,
  initialProgress
}: {
  sessionId: string;
  contractType: string;
  riskScore: number;
  features: FeatureFlags;
  lineCount: number;
  initialProgress: HiddenPracticeProgress;
}) {
  const [step, setStep] = useState<"RISK_REVIEW" | "READ" | "SUMMARIZE" | "PRACTICE" | "REPORT">("RISK_REVIEW");
  const [activeVulnerabilityOrdinal, setActiveVulnerabilityOrdinal] = useState<number | null>(null);
  const [hints, setHints] = useState<Array<{ level: number; hint: string }>>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [summaryFeedback, setSummaryFeedback] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const [lastCorrect, setLastCorrect] = useState(false);
  const [revealed, setRevealed] = useState<Reveal | null>(null);
  const [practiceComplete, setPracticeComplete] = useState(false);
  const [initialHintRequested, setInitialHintRequested] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [practiceProgress, setPracticeProgress] = useState(initialProgress);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const currentStep = step === "RISK_REVIEW" ? "ANALYZE" : step === "READ" ? "READ" : step === "SUMMARIZE" ? "SUMMARIZE" : step;
  const hintLevel = hints.length as 0 | 1 | 2 | 3;
  const showLockBanner = hintLevel < 3 && verdict?.kind === "wrong";
  const noPracticeSet = practiceProgress.densityLabel === "No hidden practice set";

  useEffect(() => {
    if (step === "PRACTICE" && noPracticeSet) return;
    if (step === "PRACTICE" && !initialHintRequested && !activeVulnerabilityOrdinal && !revealed && !hints.length && !isLoading && !report) {
      setInitialHintRequested(true);
      void requestHint(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, noPracticeSet, initialHintRequested, activeVulnerabilityOrdinal, revealed, hints.length, isLoading, report]);

  async function saveSummary(summary: string) {
    setError("");
    const response = await apiFetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, summary, ...getLlmSettings() })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      setError(data.detail || data.error || "Could not save summary.");
      return;
    }
    setSummaryFeedback(data.feedback || "");
    setStep("PRACTICE");
  }

  async function requestHint(level: 1 | 2 | 3) {
    setError("");
    resetVerdictState();
    setIsLoading(true);
    const response = await apiFetch("/api/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        vulnerabilityOrdinal: activeVulnerabilityOrdinal,
        level,
        ...getLlmSettings()
      })
    });
    const data = await response.json();
    setIsLoading(false);
    if (!response.ok || !data.ok) {
      setError(data.detail || data.error || "LLM failed while generating the hint.");
      return;
    }
    if (data.practiceComplete) {
      if (data.progress) setPracticeProgress(data.progress);
      await loadReport();
      return;
    }
    setActiveVulnerabilityOrdinal(data.activeVulnerabilityOrdinal);
    if (data.progress) setPracticeProgress(data.progress);
    if (data.fallback) {
      setFeedback(data.notice || "Live LLM is unavailable, so this hint uses the contract-specific hint saved during analysis.");
    }
    setAnswer("");
    addHint({ level: data.level, hint: data.hint });
  }

  async function submitAnswer() {
    if (!activeVulnerabilityOrdinal || hintLevel === 0) return;
    const trimmed = answer.trim();

    if (!trimmed) {
      setInlineError("Type your guess first, or click Skip to see the next hint.");
      return;
    }

    setError("");
    setInlineError("");
    setFeedback("");
    setVerdict(null);
    setVerdictLoading(true);

    try {
      const response = await apiFetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          vulnerabilityOrdinal: activeVulnerabilityOrdinal,
          hintLevel,
          userInput: trimmed,
          ...getLlmSettings()
        })
      });
      const data = await response.json();
      setVerdictLoading(false);

      if (!response.ok || !data.ok) {
        setVerdict({
          kind: "wrong",
          reasoning: data.detail || data.error || "Could not verify your guess. Try again or skip to the next hint.",
          source: "error"
        });
        setAnswer("");
        return;
      }

      if (data.correct) {
        setVerdict({
          kind: "correct",
          reasoning: data.reasoning || "Your guess matches the issue and its mechanism.",
          source: data.source
        });
        await reveal(true, "correct");
        return;
      }

      setVerdict({
        kind: "wrong",
        reasoning: data.reasoning || "That does not match the issue for this hint.",
        source: data.source
      });
      setAnswer("");
      if (hintLevel === 3) {
        await reveal(false, "wrong");
      }
    } catch {
      setVerdictLoading(false);
      setVerdict({
        kind: "wrong",
        reasoning: "Could not verify your guess because of a network error. Try again or skip to the next hint.",
        source: "error"
      });
      setAnswer("");
    }
  }

  async function skipToNextHint() {
    if (hintLevel < 3) {
      await requestHint((hintLevel + 1) as 2 | 3);
      return;
    }
    await reveal(false, "manual");
  }

  async function reveal(correct: boolean, reason: RevealReason) {
    if (!activeVulnerabilityOrdinal) return;
    setError("");
    setIsLoading(true);
    const response = await apiFetch("/api/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        vulnerabilityOrdinal: activeVulnerabilityOrdinal,
        correct,
        hintLevel,
        revealReason: reason
      })
    });
    const data = await response.json();
    setIsLoading(false);
    if (!response.ok || !data.ok) {
      setError(data.detail || data.error || "Reveal failed.");
      return;
    }
    setLastCorrect(correct);
    setRevealed(data.vulnerability);
    setPracticeComplete(Boolean(data.practiceComplete));
    if (data.progress) setPracticeProgress(data.progress);
  }

  async function continueAfterReveal() {
    setHints([]);
    setAnswer("");
    setFeedback("");
    resetVerdictState();
    setLastCorrect(false);
    setRevealed(null);
    setActiveVulnerabilityOrdinal(null);
    setInitialHintRequested(false);
    if (practiceComplete) {
      await loadReport();
    }
  }

  async function loadReport() {
    setStep("REPORT");
    setError("");
    setIsLoading(true);
    const response = await apiFetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, ...getLlmSettings() })
    });
    const data = await response.json();
    setIsLoading(false);
    if (!response.ok || !data.ok) {
      setError(data.detail || data.error || "Report failed.");
      return;
    }
    setReport(data);
  }

  function addHint(hint: { level: number; hint: string }) {
    setHints((items) => {
      const withoutDuplicate = items.filter((item) => item.level !== hint.level);
      return [...withoutDuplicate, hint].sort((a, b) => a.level - b.level);
    });
  }

  function resetVerdictState() {
    setVerdict(null);
    setVerdictLoading(false);
    setInlineError("");
  }

  return (
    <div className="grid gap-6">
      <Stepper current={currentStep} />
      {error ? (
        <div className="sticky top-4 z-10 rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger shadow-xl shadow-black/20">
          {error}
        </div>
      ) : null}
      {step === "RISK_REVIEW" ? (
        <section className="overflow-hidden rounded-lg border border-white/10 bg-surface/95 shadow-2xl shadow-black/20">
          <div className="grid gap-0 lg:grid-cols-[260px_1fr]">
            <aside className="border-b border-white/10 bg-surfaceElevated/70 p-6 lg:border-b-0 lg:border-r">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Risk lens</p>
              <div className="mt-5 flex justify-center lg:justify-start">
                <RiskScoreBadge score={riskScore} />
              </div>
              <p className="mt-5 text-sm leading-6 text-muted">
                Score reflects the saved LLM analysis. Specific findings stay hidden for practice.
              </p>
            </aside>
            <div>
              <div className="border-b border-white/10 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent">{contractType}</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">One-contract mentor session</h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
                  This is not an audit scanning tool. It accepts one contract so the LLM can build a focused understanding,
                  save hidden findings in the backend, and coach beginner auditors through the bug reasoning step by step.
                </p>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <SessionTile label="Scope" value="One Solidity contract" />
                  <SessionTile label="Storage" value="Saved backend analysis" />
                  <SessionTile label="Answers" value="Hidden until practice" />
                </div>
              </div>
              <div className="grid gap-5 p-6 xl:grid-cols-[1fr_300px]">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Contract signals</h3>
                    <span className="rounded-md border border-white/10 bg-paper px-2.5 py-1 text-xs text-muted">Public metadata only</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {featureRows(features, lineCount).map((feature) => (
                      <div key={feature.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-paper/70 p-4 text-sm">
                        <span className="text-muted">{feature.label}</span>
                        <span className={feature.active ? "font-semibold text-success" : "font-semibold text-muted"}>{feature.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <HiddenProgress progress={practiceProgress} />
              </div>
              <div className="border-t border-white/10 px-6 py-5">
                <button onClick={() => setStep("READ")} className="rounded-md bg-accent px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/30">
                  Continue
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
      {step === "READ" ? <ReadingGuide onContinue={() => setStep("SUMMARIZE")} /> : null}
      {step === "SUMMARIZE" ? <SummaryBox onSubmit={saveSummary} onSkip={() => setStep("PRACTICE")} /> : null}
      {step === "PRACTICE" ? (
        <div className="grid gap-5">
          {summaryFeedback ? (
            <div className="rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm leading-6 text-ink">
              <p className="font-semibold text-accent">LLM contract-understanding feedback</p>
              <p className="mt-1 text-muted">{summaryFeedback}</p>
            </div>
          ) : null}
          {noPracticeSet ? (
            <NoPracticeSet progress={practiceProgress} onReport={loadReport} loading={isLoading} />
          ) : revealed ? (
            <>
              <VerdictCard verdict={verdict} loading={false} />
              {!verdict && lastCorrect ? (
                <div data-testid="verdict-correct" className="rounded-lg border-l-4 border-success bg-success/10 p-4 text-sm text-success">
                  <div className="flex gap-3">
                    <span className="font-semibold">OK</span>
                    <div>
                      <h4 className="font-semibold text-ink">Correct - you spotted it.</h4>
                      <p className="mt-1">Your guess matched this vulnerability.</p>
                    </div>
                  </div>
                </div>
              ) : null}
              <RevealCard vulnerability={revealed} />
              <div className="flex flex-wrap items-center gap-4">
                <HiddenProgress progress={practiceProgress} compact />
                <button onClick={continueAfterReveal} className="w-fit rounded-md bg-accent px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/30">
                {practiceComplete ? "Generate Final Report" : "Move to next audit round"}
                </button>
              </div>
            </>
          ) : (
            <section className="overflow-hidden rounded-lg border border-white/10 bg-surface/95 shadow-2xl shadow-black/20">
              <div className="grid gap-0 xl:grid-cols-[1fr_320px]">
                <div className="p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Audit round</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Study the hint, then make your guess</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                    The LLM checks your answer against the saved backend finding for this session.
                  </p>
                  {isLoading && !hints.length ? <p className="mt-4 text-sm text-muted">Generating Hint 1 with the LLM...</p> : null}
              {error && !hints.length && !isLoading ? (
                <button
                  onClick={() => {
                    setInitialHintRequested(true);
                    void requestHint(1);
                  }}
                  className="mt-4 rounded-md border border-white/10 px-4 py-3 text-sm font-semibold text-ink"
                >
                  Retry Hint 1
                </button>
              ) : null}
                  <div className="mt-5 grid gap-4">
                    {hints.map((hint) => (
                      <HintCard key={hint.level} level={hint.level} hint={hint.hint} />
                    ))}
                  </div>
                  <VerdictCard verdict={verdict} loading={verdictLoading} />
                  {showLockBanner ? (
                    <div className="mt-5 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                      Reveal is locked until all 3 hints are shown. Keep trying, or skip to the next hint.
                    </div>
                  ) : null}
                  {feedback && hints.length ? <div className="mt-5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{feedback}</div> : null}
                  {hints.length ? (
                    <div className="mt-6">
                      <label className="text-sm font-semibold text-ink">Based on this hint, what do you think the vulnerability is?</label>
                      <textarea
                        value={answer}
                        disabled={isLoading}
                        onChange={(event) => setAnswer(event.target.value)}
                        className="mt-3 min-h-[140px] w-full rounded-lg border border-white/10 bg-paper p-4 text-sm text-ink outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                        placeholder="Name the bug class, function, or mechanism..."
                      />
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          disabled={isLoading || verdictLoading}
                          onClick={submitAnswer}
                          className="rounded-md bg-accent px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 disabled:opacity-60"
                        >
                          {verdictLoading ? "Checking..." : hintLevel === 3 ? "Submit final guess" : "Submit guess"}
                        </button>
                        {inlineError ? <span className="self-center text-sm text-warning">{inlineError}</span> : null}
                        {hintLevel < 3 ? (
                          <button
                            disabled={isLoading || verdictLoading}
                            onClick={skipToNextHint}
                            className="rounded-md border border-white/10 px-4 py-3 text-sm font-semibold text-ink disabled:opacity-60"
                          >
                            {verdict?.kind === "wrong" ? "Show next hint" : "Skip - show next hint"}
                          </button>
                        ) : (
                          <button
                            disabled={isLoading || verdictLoading}
                            onClick={() => reveal(false, "manual")}
                            className="rounded-md border border-danger/40 px-4 py-3 text-sm font-semibold text-danger disabled:opacity-60"
                          >
                            Reveal Answer
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <aside className="border-t border-white/10 bg-surfaceElevated/60 p-6 xl:border-l xl:border-t-0">
                  <HiddenProgress progress={practiceProgress} />
                  <div className="mt-5 rounded-lg border border-white/10 bg-paper/70 p-4">
                    <p className="text-sm font-semibold text-ink">Mentor mode</p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Work through one hidden finding at a time. Exact totals and full answers are delayed until the report.
                    </p>
                  </div>
                </aside>
              </div>
            </section>
          )}
        </div>
      ) : null}
      {step === "REPORT" ? report ? <FinalReport report={report} /> : <Loading label="Generating final report..." /> : null}
    </div>
  );
}

function SessionTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-paper/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function NoPracticeSet({
  progress,
  onReport,
  loading
}: {
  progress: HiddenPracticeProgress;
  onReport: () => void;
  loading: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-surface/95 shadow-2xl shadow-black/20">
      <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
        <div className="p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">No practice ladder</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">The saved analysis did not create hidden bug rounds</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            The LLM still saved its contract understanding and reviewed your summary. Since this session has no hidden
            findings, continue to the report.
          </p>
          <button
            onClick={onReport}
            disabled={loading}
            className="mt-6 rounded-md bg-accent px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 disabled:opacity-60"
          >
            {loading ? "Generating report..." : "Generate final report"}
          </button>
        </div>
        <aside className="border-t border-white/10 bg-surfaceElevated/60 p-6 lg:border-l lg:border-t-0">
          <HiddenProgress progress={progress} />
          <div className="mt-5 rounded-lg border border-white/10 bg-paper/70 p-4">
            <p className="text-sm font-semibold text-ink">Why this can happen</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Some contracts are mainly role, registry, or configuration helpers. If no credible vulnerability is saved,
              the mentor should not invent one.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function HiddenProgress({ progress, compact = false }: { progress: HiddenPracticeProgress; compact?: boolean }) {
  return (
    <div className={`${compact ? "min-w-[260px] flex-1" : ""} rounded-lg border border-white/10 bg-paper/70 p-4`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Hidden progress</p>
          <p className="mt-2 text-sm font-semibold text-ink">{progress.densityLabel}</p>
        </div>
        <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${progressToneClass(progress.tone)}`}>{progress.stageLabel}</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${progress.fillPercent}%` }} />
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">{progress.detail}</p>
    </div>
  );
}

function progressToneClass(tone: HiddenPracticeProgress["tone"]) {
  if (tone === "complete") return "bg-success/15 text-success";
  if (tone === "near") return "bg-warning/15 text-warning";
  if (tone === "active") return "bg-accent/15 text-accent";
  return "bg-white/10 text-muted";
}

function VerdictCard({ verdict, loading }: { verdict: Verdict | null; loading: boolean }) {
  if (loading) {
    return (
      <div data-testid="verdict-loading" className="mt-5 rounded-lg border-l-4 border-white/20 bg-white/5 p-4 text-sm text-muted">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-accent" />
          <span>Checking your guess...</span>
        </div>
      </div>
    );
  }

  if (!verdict) return null;

  if (verdict.kind === "correct") {
    return (
      <div data-testid="verdict-correct" className="mt-5 rounded-lg border-l-4 border-success bg-success/10 p-4 text-sm text-success">
        <div className="flex gap-3">
          <span className="font-semibold">OK</span>
          <div>
            <h4 className="font-semibold text-ink">Correct - you spotted it.</h4>
            <p className="mt-1">{verdict.reasoning}</p>
            {verdict.source === "local-fallback" ? <p className="mt-2 text-xs text-muted">Checked locally - LLM unavailable.</p> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="verdict-wrong" className="mt-5 rounded-lg border-l-4 border-warning bg-warning/10 p-4 text-sm text-warning">
      <div className="flex gap-3">
        <span className="font-semibold">?</span>
        <div>
          <h4 className="font-semibold text-ink">Not quite.</h4>
          <p className="mt-1">{verdict.reasoning}</p>
          {verdict.source === "local-fallback" ? <p className="mt-2 text-xs text-muted">Checked locally - LLM unavailable.</p> : null}
        </div>
      </div>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return <div className="rounded-lg border border-white/10 bg-surface p-6 text-sm text-muted">{label}</div>;
}

function getLlmSettings() {
  if (typeof window === "undefined") return {};
  return {
    llmBaseUrl: window.localStorage.getItem("llmBaseUrl") || undefined
  };
}

function featureRows(features: FeatureFlags, lineCount: number) {
  return [
    { label: "Lines reviewed", value: String(lineCount), active: true },
    { label: "Handles user funds", value: features.handlesFunds ? "Yes" : "No", active: Boolean(features.handlesFunds) },
    { label: "External calls", value: features.externalCalls ? "Yes" : "No", active: Boolean(features.externalCalls) },
    { label: "Token transfers", value: features.tokenTransfers ? "Yes" : "No", active: Boolean(features.tokenTransfers) },
    { label: "Access-control patterns", value: features.accessControl ? "Seen" : "Not seen", active: Boolean(features.accessControl) },
    { label: "Signature verification", value: features.signatures ? "Seen" : "Not seen", active: Boolean(features.signatures) },
    { label: "Oracle usage", value: features.oracle ? "Seen" : "Not seen", active: Boolean(features.oracle) },
    { label: "Upgradeable patterns", value: features.upgradeable ? "Seen" : "Not seen", active: Boolean(features.upgradeable) },
    { label: "Complex accounting", value: features.complexAccounting ? "Seen" : "Not seen", active: Boolean(features.complexAccounting) }
  ];
}
