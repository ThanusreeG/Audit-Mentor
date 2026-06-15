"use client";

import { useState } from "react";

export default function SummaryBox({
  onSubmit,
  onSkip
}: {
  onSubmit: (summary: string) => Promise<void> | void;
  onSkip: () => void;
}) {
  const [summary, setSummary] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitSummary() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(summary);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-surface/95 shadow-2xl shadow-black/20">
      <div className="border-b border-white/10 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Understanding check</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Summarize the contract in your own words</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          The LLM compares this against the saved contract analysis without revealing hidden findings.
        </p>
      </div>
      <div className="p-6">
        <textarea
          value={summary}
          disabled={isSubmitting}
          onChange={(event) => setSummary(event.target.value)}
          className="min-h-[190px] w-full rounded-lg border border-white/10 bg-paper p-4 text-sm text-ink outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          placeholder="Summarize users, assets, trusted roles, and important flows..."
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={submitSummary}
            disabled={isSubmitting}
            className="rounded-md bg-accent px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Reviewing summary..." : "Submit Summary"}
          </button>
          <button
            onClick={onSkip}
            disabled={isSubmitting}
            className="rounded-md border border-white/10 px-4 py-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            Skip and Continue
          </button>
          {isSubmitting ? <span className="text-sm text-muted">Saving and asking the LLM to review it.</span> : null}
        </div>
      </div>
    </section>
  );
}
