"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";

type HealthState = {
  ok?: boolean;
  overall?: "live" | "degraded" | "down";
  checkedAt?: string;
};

export default function LlmStatusDot() {
  const [state, setState] = useState<HealthState | null>(null);

  useEffect(() => {
    void testConnection();
    const interval = window.setInterval(() => void testConnection(), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  async function testConnection() {
    try {
      const response = await apiFetch("/api/llm/health", { cache: "no-store" });
      const data = await response.json();
      setState({
        ok: response.ok && Boolean(data.ok),
        overall: data.overall,
        checkedAt: new Date().toLocaleTimeString()
      });
    } catch {
      setState({
        ok: false,
        overall: "down",
        checkedAt: new Date().toLocaleTimeString()
      });
    }
  }

  const status = state?.overall || (state?.ok ? "live" : state ? "down" : "down");
  const color = status === "live" ? "bg-success" : status === "degraded" ? "bg-warning" : state ? "bg-danger" : "bg-warning";
  const label = status === "live" ? "LLM live" : status === "degraded" ? "LLM degraded" : state ? "LLM down" : "LLM check";

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-white/10 bg-surface px-3 py-2 text-xs text-muted shadow-lg shadow-black/10"
      title={state?.checkedAt ? `Last checked ${state.checkedAt}` : "Checking LLM"}
      aria-label={label}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </div>
  );
}
