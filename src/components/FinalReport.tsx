type Report = {
  stats: {
    total: number;
    correctlyIdentified: number;
    missed: number;
    incorrectSuspicions: number;
    hintsUsed: number;
    appGuided: number;
    identifiedOnHint1: number;
    identifiedOnHint2: number;
    identifiedOnHint3: number;
    identifiedAfterHints: number;
    revealedWithoutCorrect: number;
    revealedAfterWrong: number;
    revealedAfterBlank: number;
    totalWrongGuesses: number;
    breakdown: Array<{
      title: string;
      severity: string;
      identifiedHow: string;
      solvedAtHintLevel: number | null;
      wrongGuesses: number;
    }>;
    userSummary: string;
  };
  qualitative: {
    strengths: string[];
    weaknesses: string[];
    improvementSuggestions: string[];
    nextTopics: string[];
  };
};

export default function FinalReport({ report }: { report: Report }) {
  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-surface/95 shadow-2xl shadow-black/20">
      <div className="border-b border-white/10 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Final report</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Performance Report</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Exact hidden totals are shown here after the practice flow is complete.
        </p>
      </div>
      <div className="grid gap-3 p-6 md:grid-cols-4">
        <Metric label="Total" value={report.stats.total} />
        <Metric label="Solved on H1" value={report.stats.identifiedOnHint1} />
        <Metric label="Solved on H2" value={report.stats.identifiedOnHint2} />
        <Metric label="Solved on H3" value={report.stats.identifiedOnHint3} />
        <Metric label="Revealed" value={report.stats.revealedWithoutCorrect} />
        <Metric label="Wrong guesses" value={report.stats.totalWrongGuesses} />
        <Metric label="Hints" value={report.stats.hintsUsed} />
        <Metric label="Blank reveals" value={report.stats.revealedAfterBlank} />
        <Metric label="Wrong reveals" value={report.stats.revealedAfterWrong} />
      </div>
      <div className="px-6 pb-6">
      {report.stats.userSummary ? (
        <section className="rounded-lg border border-white/10 bg-surfaceElevated p-4">
          <h3 className="text-sm font-semibold text-accent">Your Summary</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{report.stats.userSummary}</p>
        </section>
      ) : null}
      {report.stats.breakdown?.length ? (
        <section className="mt-6 rounded-lg border border-white/10 bg-surfaceElevated p-4">
          <h3 className="text-sm font-semibold text-accent">Per-Vulnerability Breakdown</h3>
          <div className="mt-3 grid gap-2">
            {report.stats.breakdown.map((item) => (
              <div key={item.title} className="rounded-lg border border-white/10 bg-paper p-3 text-sm text-muted">
                <span className="font-semibold text-ink">{item.title}</span>
                <span className="ml-2 text-xs text-muted">{item.severity}</span>
                <span className={`ml-2 rounded-full px-2 py-1 text-xs font-semibold ${statusClass(item.solvedAtHintLevel, item.identifiedHow)}`}>
                  {statusLabel(item.solvedAtHintLevel, item.identifiedHow)}
                </span>
                <p className="mt-2">Wrong guesses on this vulnerability: {item.wrongGuesses}</p>
                <p className="mt-1">Hints used: {item.solvedAtHintLevel || 3} / 3</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <Bullets title="Strengths" items={report.qualitative.strengths} />
      <Bullets title="Weaknesses" items={report.qualitative.weaknesses} />
      <Bullets title="Improvement Suggestions" items={report.qualitative.improvementSuggestions} />
      <Bullets title="Next Topics" items={report.qualitative.nextTopics} />
      </div>
    </section>
  );
}

function statusLabel(level: number | null, identifiedHow: string) {
  if (identifiedHow === "revealed" || !level) return "Revealed without solving";
  if (level === 1) return "Solved on Hint 1";
  if (level === 2) return "Solved on Hint 2";
  return "Solved on Hint 3";
}

function statusClass(level: number | null, identifiedHow: string) {
  if (identifiedHow === "revealed" || !level) return "bg-danger/10 text-danger";
  if (level === 1) return "bg-success/15 text-success";
  if (level === 2) return "bg-success/10 text-success";
  return "bg-warning/10 text-warning";
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surfaceElevated p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-accent">{value}</p>
    </div>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-accent">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-muted">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </section>
  );
}
