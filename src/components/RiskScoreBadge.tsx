export default function RiskScoreBadge({ score }: { score: number }) {
  const color = score >= 7 ? "text-danger" : score >= 5 ? "text-warning" : "text-success";
  return (
    <div className="relative flex h-44 w-44 items-center justify-center rounded-full border border-white/5 bg-surfaceElevated">
      <div className="absolute inset-0 rounded-full bg-accent/10 blur-2xl" />
      <div className="relative text-center">
        <div className={`text-6xl font-semibold ${color}`}>{score.toFixed(1)}</div>
        <div className="text-sm text-muted">/10</div>
      </div>
    </div>
  );
}
