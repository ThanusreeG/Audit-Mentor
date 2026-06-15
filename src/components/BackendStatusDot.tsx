"use client";

import { useEffect, useState } from "react";
import { apiFetch, getApiBaseUrl, setApiBaseUrl } from "@/lib/client-api";

type BackendState = {
  ok: boolean;
  service?: string;
  checkedAt?: string;
  error?: string;
};

export default function BackendStatusDot() {
  const [state, setState] = useState<BackendState | null>(null);
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    setBaseUrl(getApiBaseUrl());
    void testConnection(false);

    function handleBaseUrlChange() {
      setBaseUrl(getApiBaseUrl());
      void testConnection(false);
    }

    window.addEventListener("audit-assistant-api-base-url-changed", handleBaseUrlChange);
    return () => window.removeEventListener("audit-assistant-api-base-url-changed", handleBaseUrlChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function testConnection(showResult = true) {
    try {
      const response = await apiFetch("/api/server/health", { cache: "no-store" });
      const data = await response.json();
      const next = {
        ok: response.ok && Boolean(data.ok),
        service: data.service,
        checkedAt: new Date().toLocaleTimeString(),
        error: response.ok ? undefined : data.error || "Backend returned an error"
      };
      setState(next);
      if (showResult && !next.ok) setOpen(true);
    } catch (error) {
      setState({
        ok: false,
        checkedAt: new Date().toLocaleTimeString(),
        error: error instanceof Error ? error.message : "Could not reach backend"
      });
      if (showResult) setOpen(true);
    }
  }

  function save() {
    setApiBaseUrl(baseUrl);
    void testConnection(true);
  }

  const ok = Boolean(state?.ok);
  const color = ok ? "bg-success" : state ? "bg-danger" : "bg-warning";
  const label = ok ? "Backend live" : state ? "Backend down" : "Backend check";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-white/10 bg-surface px-3 py-2 text-xs text-muted shadow-lg shadow-black/10"
        title={getApiBaseUrl() || "Same-origin backend"}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4">
          <section className="w-full max-w-xl rounded-lg border border-white/10 bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">Backend Server</h2>
                <p className="mt-1 text-sm text-muted">Use this when the frontend is hosted separately from the MacBook server.</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md border border-white/10 px-3 py-1 text-sm text-muted">
                Close
              </button>
            </div>
            <label className="mt-5 block text-sm font-semibold text-ink">
              API base URL
              <input
                value={baseUrl}
                placeholder="http://127.0.0.1:3000 or https://your-tunnel.example"
                onChange={(event) => setBaseUrl(event.target.value)}
                className="mt-2 w-full rounded-md border border-white/10 bg-paper px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <p className="mt-2 text-xs leading-5 text-muted">Leave blank when the frontend and backend are served by the same Next.js app.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={save} className="rounded-md bg-accent px-4 py-3 text-sm font-semibold text-slate-950">
                Save and test
              </button>
              <button onClick={() => testConnection(true)} className="rounded-md border border-white/10 px-4 py-3 text-sm font-semibold text-ink">
                Test now
              </button>
            </div>
            <div className="mt-5 rounded-lg border border-white/10 bg-paper p-4 text-sm text-muted">
              <p>Status: {label}</p>
              <p>Current target: {getApiBaseUrl() || "same origin"}</p>
              <p>Last checked: {state?.checkedAt || "Not checked yet"}</p>
              {state?.error ? <p className="mt-2 text-danger">{state.error}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
