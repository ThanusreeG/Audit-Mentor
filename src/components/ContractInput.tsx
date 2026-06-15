"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { summarizeContractDeclarations } from "@/lib/contract-validation";

const starter = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PasteContractHere {
    // Paste or upload Solidity source
}`;

export default function ContractInput() {
  const router = useRouter();
  const [contractSource, setContractSource] = useState(starter);
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [visibleSignals, setVisibleSignals] = useState<string[]>([]);
  const declarationSummary = useMemo(() => summarizeContractDeclarations(contractSource), [contractSource]);
  const contractStatus = statusForContracts(declarationSummary.concreteContracts.length);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (declarationSummary.concreteContracts.length !== 1) {
      setError(
        declarationSummary.concreteContracts.length > 1
          ? "Paste one concrete contract only. This is a mentor session, not a multi-contract audit scanner."
          : "Paste one concrete Solidity contract before analyzing."
      );
      return;
    }

    setIsAnalyzing(true);
    fakeSignalStream();

    try {
      const response = await apiFetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractSource })
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setIsAnalyzing(false);
        setError(formatAnalysisError(data.detail || data.error || "Analysis failed"));
        return;
      }

      router.push(`/audit?sessionId=${encodeURIComponent(data.sessionId)}`);
    } catch (error) {
      setIsAnalyzing(false);
      setError(formatAnalysisError(error instanceof Error ? error.message : "Analysis failed"));
    }
  }

  function fakeSignalStream() {
    const labels = ["single contract scope", "fund flows", "external calls", "token transfers", "access control", "saved backend analysis"];
    setVisibleSignals([]);
    labels.forEach((label, index) => {
      setTimeout(() => setVisibleSignals((items) => [...items, label]), 250 * (index + 1));
    });
  }

  async function upload(file?: File) {
    if (!file) return;
    if (!file.name.endsWith(".sol")) {
      setError("Upload a .sol file.");
      return;
    }
    setContractSource(await file.text());
  }

  return (
    <form onSubmit={analyze} className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="rounded-lg border border-white/10 bg-surface/95 p-6 shadow-2xl shadow-black/20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Focused mentor</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">One contract only</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Paste one concrete Solidity contract. The LLM studies it deeply, saves the hidden analysis in the backend,
            then coaches you through understanding and bug discovery.
          </p>
        </div>

        <div className={`mt-5 rounded-lg border p-4 ${contractStatus.className}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Scope check</p>
          <p className="mt-2 text-sm font-semibold">{contractStatus.label}</p>
          {declarationSummary.interfaces.length || declarationSummary.libraries.length ? (
            <p className="mt-2 text-xs leading-5 opacity-80">Interfaces and libraries are allowed as support context.</p>
          ) : null}
        </div>

        <label className="mt-5 block text-sm font-semibold text-ink">
          Upload `.sol`
          <input
            type="file"
            accept=".sol"
            onChange={(event) => upload(event.target.files?.[0])}
            className="mt-3 w-full rounded-md border border-white/10 bg-paper px-3 py-2 text-sm text-muted"
          />
        </label>
        <button
          disabled={isAnalyzing}
          className="mt-5 w-full rounded-md bg-accent px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 disabled:opacity-60"
        >
          {isAnalyzing ? "Analyzing contract..." : "Analyze Contract"}
        </button>
        {isAnalyzing ? (
          <div className="mt-5 space-y-2 text-sm text-muted">
            {visibleSignals.map((signal) => (
              <div key={signal} className="rounded-md border border-white/10 bg-surfaceElevated px-3 py-2">
                Checking {signal}
              </div>
            ))}
          </div>
        ) : null}
        {error ? (
          <div className="sticky top-4 mt-5 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}
      </aside>
      <section className="overflow-hidden rounded-lg border border-white/10 bg-[#080B12] shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-surface px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">Contract source</p>
            <p className="mt-1 text-xs text-muted">Hidden findings are generated after backend analysis.</p>
          </div>
          <span className="rounded-md border border-white/10 bg-paper px-2.5 py-1 text-xs text-muted">Solidity</span>
        </div>
        <textarea
          value={contractSource}
          onChange={(event) => setContractSource(event.target.value)}
          spellCheck={false}
          className="min-h-[640px] w-full resize-y bg-transparent p-5 font-mono text-[13px] leading-6 text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-accent"
        />
      </section>
    </form>
  );
}

function statusForContracts(count: number) {
  if (count === 1) {
    return {
      label: "One contract detected",
      className: "border-success/30 bg-success/10 text-success"
    };
  }

  if (count > 1) {
    return {
      label: "Multiple contracts detected",
      className: "border-danger/40 bg-danger/10 text-danger"
    };
  }

  return {
    label: "No contract detected yet",
    className: "border-warning/40 bg-warning/10 text-warning"
  };
}

function formatAnalysisError(message: string) {
  if (/aborted|timed out/i.test(message)) {
    return "Analysis timed out. Please click Analyze Contract again.";
  }

  return message;
}
