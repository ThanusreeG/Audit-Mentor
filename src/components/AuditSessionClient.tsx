"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import type { AuditSessionView } from "@/lib/audit-session-view";
import AuditFlow from "./AuditFlow";
import BackendStatusDot from "./BackendStatusDot";
import LlmStatusDot from "./LlmStatusDot";

export default function AuditSessionClient({ sessionId }: { sessionId: string | null }) {
  const [session, setSession] = useState<AuditSessionView | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setError("Missing audit session ID.");
      return;
    }

    const currentSessionId = sessionId;
    let cancelled = false;
    async function loadSession() {
      setLoading(true);
      setError("");
      try {
        const response = await apiFetch(`/api/session?sessionId=${encodeURIComponent(currentSessionId)}`, { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok || !data.ok) {
          setError(data.error || "Could not load this audit session.");
          setSession(null);
          return;
        }
        setSession(data.session);
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Could not load this audit session.");
          setSession(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const title = session ? `${session.contractType} contract` : "Mentor Session";

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-5 py-6 sm:px-6 lg:py-8">
        <header className="grid gap-6 border-b border-white/10 pb-6 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">Mentor Session</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              One submitted contract, one saved backend analysis, and a hidden practice set that unlocks through hints.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <BackendStatusDot />
            <LlmStatusDot />
          </div>
        </header>
        {loading ? <Panel>Loading audit session...</Panel> : null}
        {error ? <Panel tone="error">{error}</Panel> : null}
        {session ? (
          <AuditFlow
            sessionId={session.sessionId}
            contractType={session.contractType}
            riskScore={session.riskScore}
            features={session.features}
            lineCount={session.lineCount}
            initialProgress={session.initialProgress}
          />
        ) : null}
      </section>
    </main>
  );
}

function Panel({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "error" }) {
  const className =
    tone === "error"
      ? "rounded-lg border border-danger/40 bg-danger/10 p-6 text-sm text-danger"
      : "rounded-lg border border-white/10 bg-surface p-6 text-sm text-muted";
  return <div className={className}>{children}</div>;
}
