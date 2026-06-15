const readingSteps = [
  "Identify the purpose of the contract.",
  "Identify important state variables.",
  "Identify who can call important functions.",
  "Track where funds enter the contract.",
  "Track where funds leave the contract.",
  "Check external calls and token transfers.",
  "Check admin/owner-only functions.",
  "Check signatures, oracles, upgradeability, or accounting."
];

export default function ReadingGuide({ onContinue }: { onContinue: () => void }) {
  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-surface/95 shadow-2xl shadow-black/20">
      <div className="border-b border-white/10 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Reading pass</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Understand the contract before hunting</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          The next answer you write is checked against the saved backend understanding, not a generic checklist.
        </p>
      </div>
      <div className="grid gap-3 p-6 md:grid-cols-2">
        {readingSteps.map((step, index) => (
          <div key={step} className="rounded-lg border border-white/10 bg-paper/70 p-4 text-sm text-ink">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-xs font-semibold text-accent">
              {index + 1}
            </span>
            {step}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-6 py-5">
        <button onClick={onContinue} className="rounded-md bg-accent px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/30">
          Continue
        </button>
      </div>
    </section>
  );
}
