type Reveal = {
  title: string;
  severity: string;
  codeSnippet: string;
  explanation: string;
  attackScenario: string;
  impact: string;
  fix: string;
  learningNote: string;
};

export default function RevealCard({ vulnerability }: { vulnerability: Reveal }) {
  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-surface/95 shadow-2xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Reveal</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{vulnerability.title}</h2>
        </div>
        <span className={`rounded-md border px-3 py-1 text-sm font-semibold ${severityClass(vulnerability.severity)}`}>
          {vulnerability.severity}
        </span>
      </div>
      <div className="p-6">
        <pre className="overflow-auto rounded-lg border border-white/10 bg-[#080B12] p-4 font-mono text-[13px] leading-6 text-ink">
          <code>{vulnerability.codeSnippet}</code>
        </pre>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Dossier title="Explanation" body={vulnerability.explanation} />
          <Dossier title="Attack" body={vulnerability.attackScenario} />
          <Dossier title="Impact" body={vulnerability.impact} />
          <Dossier title="Fix" body={vulnerability.fix} />
        </div>
        <Dossier title="Learning Note" body={vulnerability.learningNote} wide />
      </div>
    </section>
  );
}

function Dossier({ title, body, wide = false }: { title: string; body: string; wide?: boolean }) {
  return (
    <section className={`rounded-lg border border-white/10 bg-paper/70 p-4 ${wide ? "mt-4" : ""}`}>
      <h3 className="text-sm font-semibold text-accent">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
    </section>
  );
}

function severityClass(severity: string) {
  if (severity === "Critical") return "border-critical/40 bg-critical/10 text-critical";
  if (severity === "High") return "border-high/40 bg-high/10 text-high";
  if (severity === "Medium") return "border-medium/40 bg-medium/10 text-medium";
  if (severity === "Low") return "border-low/40 bg-low/10 text-low";
  return "border-white/10 bg-white/10 text-muted";
}
