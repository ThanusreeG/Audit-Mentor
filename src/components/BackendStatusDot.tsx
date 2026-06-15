"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";

type BackendState = {
  ok: boolean;
  checkedAt?: string;
};

export default function BackendStatusDot() {
  const [state, setState] = useState<BackendState | null>(null);

  useEffect(() => {
    void testConnection();
    const interval = window.setInterval(() => void testConnection(), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  async function testConnection() {
    try {
      const response = await apiFetch("/api/server/health", { cache: "no-store" });
      const data = await response.json();
      setState({
        ok: response.ok && Boolean(data.ok),
        checkedAt: new Date().toLocaleTimeString()
      });
    } catch {
      setState({
        ok: false,
        checkedAt: new Date().toLocaleTimeString()
      });
    }
  }

  const ok = Boolean(state?.ok);
  const color = ok ? "bg-success" : state ? "bg-danger" : "bg-warning";
  const label = ok ? "Backend live" : state ? "Backend down" : "Backend check";

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-white/10 bg-surface px-3 py-2 text-xs text-muted shadow-lg shadow-black/10"
      title={state?.checkedAt ? `Last checked ${state.checkedAt}` : "Checking backend"}
      aria-label={label}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </div>
  );
}
