export type LlmRouteName = "health" | "hint" | "checkGuess";

export type LlmRouteStatus = {
  ok: boolean;
  lastError?: string;
  latencyMs?: number;
  status?: number;
  rawResponse?: string;
  checkedAt?: string;
};

export type LlmHealthSnapshot = {
  overall: "live" | "degraded" | "down";
  routes: Record<LlmRouteName, LlmRouteStatus>;
  lastCheckedAt: string;
};

const EMPTY_ROUTES: Record<LlmRouteName, LlmRouteStatus> = {
  health: { ok: false, lastError: "Not checked yet" },
  hint: { ok: false, lastError: "Not checked yet" },
  checkGuess: { ok: false, lastError: "Not checked yet" }
};

const store = globalThis as typeof globalThis & { __sentinelLlmStatus?: Record<LlmRouteName, LlmRouteStatus> };

function routeStore() {
  if (!store.__sentinelLlmStatus) store.__sentinelLlmStatus = { ...EMPTY_ROUTES };
  return store.__sentinelLlmStatus;
}

export function markLlmRoute(name: LlmRouteName, status: Omit<LlmRouteStatus, "checkedAt">) {
  routeStore()[name] = { ...status, checkedAt: new Date().toISOString() };
}

export function getLlmHealthSnapshot(): LlmHealthSnapshot {
  const routes = routeStore();
  const lastCheckedAt =
    Object.values(routes)
      .map((route) => route.checkedAt)
      .filter(Boolean)
      .sort()
      .at(-1) || new Date().toISOString();
  const fresh = (route: LlmRouteStatus) => {
    if (!route.checkedAt) return false;
    return Date.now() - new Date(route.checkedAt).getTime() <= 60_000;
  };
  const healthOk = routes.health.ok && fresh(routes.health);
  const hintOk = routes.hint.ok && fresh(routes.hint);
  const checkGuessOk = routes.checkGuess.ok && fresh(routes.checkGuess);
  const overall = healthOk && hintOk && checkGuessOk ? "live" : healthOk ? "degraded" : "down";

  return { overall, routes: { ...routes }, lastCheckedAt };
}

