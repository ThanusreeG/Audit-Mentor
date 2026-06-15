"use client";

const steps = ["INPUT", "ANALYZE", "READ", "SUMMARIZE", "PRACTICE", "REPORT"];

export default function Stepper({ current }: { current: string }) {
  const currentIndex = steps.indexOf(current);
  return (
    <nav className="rounded-lg border border-white/10 bg-surface/80 p-2 shadow-xl shadow-black/10">
      <div className="flex flex-wrap gap-2">
      {steps.map((step, index) => (
        <span
          key={step}
          className={`rounded-md border px-3 py-2 text-xs font-semibold ${
            index === currentIndex
              ? "border-accent/60 bg-accent/10 text-accent"
              : index < currentIndex
                ? "border-success/30 bg-success/10 text-success"
                : "border-white/10 text-muted"
          }`}
        >
          {index < currentIndex ? "Done " : ""}
          {step}
        </span>
      ))}
      </div>
    </nav>
  );
}
