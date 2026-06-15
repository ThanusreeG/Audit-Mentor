"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { REQUIRED_LLM_MODEL } from "@/lib/llm-model";

const DEFAULT_MODEL = REQUIRED_LLM_MODEL;
const OLD_MODEL = "google/gemma-4-e2b";
const OLD_QWEN_MODEL = "qwen/qwen3-coder-next";
const OLD_FLASH_MODEL = "deepseek-v4-flash";
const DEFAULT_LLM_URL = "https://api.deepseek.com";
const OLD_LLM_URL = "https://783d-2405-201-c002-288c-b0de-44b6-6e43-cacf.ngrok-free.app";
const OLD_QWEN_LLM_URL = "https://5bf8-2405-201-c002-288c-21bb-6e3f-9165-84f4.ngrok-free.app";

type HealthState = {
  ok?: boolean;
  overall?: "live" | "degraded" | "down";
  model?: string;
  routes?: Record<"health" | "hint" | "checkGuess", { ok: boolean; lastError?: string; latencyMs?: number; status?: number; rawResponse?: string; checkedAt?: string }>;
  lastCheckedAt?: string;
  checkedAt?: string;
};

export default function LlmStatusDot() {
  const [state, setState] = useState<HealthState | null>(null);
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_LLM_URL);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [rawResult, setRawResult] = useState("");

  useEffect(() => {
    migrateOldEndpoint();
    const storedBaseUrl = window.localStorage.getItem("llmBaseUrl") || window.localStorage.getItem("llmUrl") || DEFAULT_LLM_URL;
    window.localStorage.removeItem("llmModel");
    const storedModel = DEFAULT_MODEL;
    setBaseUrl(storedBaseUrl);
    setModel(storedModel);
    void testConnection(storedBaseUrl, storedModel, false);
    const interval = window.setInterval(() => {
      void testConnection(
        window.localStorage.getItem("llmBaseUrl") || window.localStorage.getItem("llmUrl") || DEFAULT_LLM_URL,
        DEFAULT_MODEL,
        false
      );
    }, 30_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function testConnection(nextBaseUrl = baseUrl, nextModel = model, showRaw = true) {
    try {
      const params = new URLSearchParams();
      if (nextBaseUrl) params.set("baseUrl", nextBaseUrl);
      if (nextModel) params.set("model", nextModel);
      const response = await apiFetch(`/api/llm/health?${params.toString()}`);
      const data = await response.json();
      const next = { ...data, checkedAt: new Date().toLocaleTimeString() };
      setState(next);
      if (showRaw) setRawResult(JSON.stringify(next, null, 2));
    } catch (error) {
      const next = {
        ok: false,
        overall: "down" as const,
        routes: {
          health: { ok: false, lastError: error instanceof Error ? error.message : "Connection failed" },
          hint: { ok: false, lastError: "Not checked" },
          checkGuess: { ok: false, lastError: "Not checked" }
        },
        checkedAt: new Date().toLocaleTimeString()
      };
      setState(next);
      if (showRaw) setRawResult(JSON.stringify(next, null, 2));
    }
  }

  function save() {
    window.localStorage.setItem("llmBaseUrl", baseUrl);
    window.localStorage.removeItem("llmModel");
    setModel(DEFAULT_MODEL);
    void testConnection(baseUrl, DEFAULT_MODEL);
  }

  const status = state?.overall || (state?.ok ? "live" : state ? "degraded" : "down");
  const color = status === "live" ? "bg-success" : status === "degraded" ? "bg-warning" : "bg-danger";
  const label = status === "live" ? "LLM live" : status === "degraded" ? "LLM degraded" : "LLM down";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-white/10 bg-surface px-3 py-2 text-xs text-muted shadow-lg shadow-black/10"
        title={state ? `${state.model || model} ${state.overall || "unknown"}` : "Checking LLM"}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4">
          <section className="w-full max-w-2xl rounded-lg border border-white/10 bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">LLM Diagnostics</h2>
                <p className="mt-1 text-sm text-muted">The browser calls the configured backend. That backend calls the LLM, so provider keys stay server-side.</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md border border-white/10 px-3 py-1 text-sm text-muted">
                Close
              </button>
            </div>
            <label className="mt-5 block text-sm font-semibold text-ink">
              Endpoint base URL
              <input
                value={baseUrl}
                placeholder={DEFAULT_LLM_URL}
                onChange={(event) => setBaseUrl(event.target.value)}
                className="mt-2 w-full rounded-md border border-white/10 bg-paper px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <div className="mt-4 rounded-lg border border-white/10 bg-paper p-4 text-sm">
              <p className="font-semibold text-ink">Model</p>
              <p className="mt-2 font-mono text-accent">{DEFAULT_MODEL}</p>
              <p className="mt-2 text-muted">Locked server-side to avoid Flash hallucinating fake findings.</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={save} className="rounded-md bg-accent px-4 py-3 text-sm font-semibold text-slate-950">
                Save and test
              </button>
              <button onClick={() => testConnection()} className="rounded-md border border-white/10 px-4 py-3 text-sm font-semibold text-ink">
                Run diagnostic now
              </button>
            </div>
            <div className="mt-5 rounded-lg border border-white/10 bg-paper p-4 text-sm text-muted">
              <p>Status: {label}</p>
              <p>Last checked: {state?.checkedAt || "Not checked yet"}</p>
              <div className="mt-4 grid gap-2">
                {(["health", "hint", "checkGuess"] as const).map((route) => {
                  const routeState = state?.routes?.[route];
                  return (
                    <div key={route} className="rounded-lg border border-white/10 bg-surfaceElevated p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-ink">{routeLabel(route)}</span>
                        <span className={routeState?.ok ? "text-success" : "text-warning"}>{routeState?.ok ? "ok" : "failing"}</span>
                      </div>
                      <p className="mt-1 text-xs">Latency: {routeState?.latencyMs ?? "?"}ms</p>
                      {routeState?.lastError ? <p className="mt-1 text-xs text-danger">{routeState.lastError}</p> : null}
                      {routeState?.lastError && /model.*not found|not found.*model|404/i.test(routeState.lastError) ? (
                        <p className="mt-1 text-xs text-warning">
                          The configured model may not exist. Confirm the model name your LLM server has loaded.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            {rawResult ? <pre className="mt-5 max-h-56 overflow-auto rounded-lg bg-paper p-4 text-xs text-muted">{rawResult}</pre> : null}
            <ul className="mt-5 space-y-1 text-xs text-muted">
              <li>Common causes: invalid API key, insufficient DeepSeek credits, model name mismatch, network timeout, or provider outage.</li>
              <li>If terminal curl works but browser fails, this app still avoids CORS by using server API routes.</li>
            </ul>
          </section>
        </div>
      ) : null}
    </>
  );
}

function routeLabel(route: "health" | "hint" | "checkGuess") {
  if (route === "checkGuess") return "Guess checking";
  if (route === "hint") return "Hint generation";
  return "Health probe";
}

function migrateOldEndpoint() {
  for (const key of ["llmUrl", "llmBaseUrl"]) {
    const stored = window.localStorage.getItem(key);
    if (stored === OLD_LLM_URL || stored === OLD_QWEN_LLM_URL) window.localStorage.removeItem(key);
  }
  if ([OLD_MODEL, OLD_QWEN_MODEL, OLD_FLASH_MODEL, DEFAULT_MODEL].includes(window.localStorage.getItem("llmModel") || "")) {
    window.localStorage.removeItem("llmModel");
  }
}
