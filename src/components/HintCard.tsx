export default function HintCard({ level, hint }: { level: number; hint: string }) {
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/10 p-5 shadow-lg shadow-cyan-950/20">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-accent">Hint {level} / 3</p>
        <span className="rounded-md border border-accent/30 bg-paper/60 px-2.5 py-1 text-xs text-muted">
          {level === 1 ? "Soft" : level === 2 ? "Directed" : "Near answer"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink">{hint}</p>
    </div>
  );
}
