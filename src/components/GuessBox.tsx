"use client";

import { useState } from "react";

export default function GuessBox({
  disabled,
  onGuess,
  onStuck
}: {
  disabled?: boolean;
  onGuess: (value: string) => void;
  onStuck: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <section className="rounded-2xl border border-white/5 bg-surface p-6">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">Which part looks suspicious?</h2>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        className="mt-5 min-h-[140px] w-full rounded-xl border border-white/5 bg-paper p-4 text-sm text-ink outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
        placeholder="Function name, code line, bug idea, or suspicious logic..."
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          disabled={disabled}
          onClick={() => {
            onGuess(value);
            setValue("");
          }}
          className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60"
        >
          Submit Guess
        </button>
        <button disabled={disabled} onClick={onStuck} className="rounded-xl border border-white/5 px-4 py-3 text-sm font-semibold text-ink">
          I am stuck, give me a hint
        </button>
      </div>
    </section>
  );
}
