import BackendStatusDot from "@/components/BackendStatusDot";
import ContractInput from "@/components/ContractInput";
import LlmStatusDot from "@/components/LlmStatusDot";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-5 py-6 sm:px-6 lg:py-8">
        <header className="grid gap-6 border-b border-white/10 pb-7 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">AI Smart Contract Audit Mentor</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              Understand one Solidity contract, then hunt hidden bugs with hints.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted">
              This is not a bulk audit scanner. Paste one contract and the backend LLM saves a private analysis plus
              hidden findings, then helps beginners build the core reasoning faster through summaries, guesses, and reveals.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["One contract", "Backend saved analysis", "Hint-first practice", "Exact totals delayed"].map((item) => (
                <span key={item} className="rounded-md border border-white/10 bg-surface px-3 py-1.5 text-xs font-semibold text-muted">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <BackendStatusDot />
            <LlmStatusDot />
          </div>
        </header>
        <ContractInput />
      </section>
    </main>
  );
}
