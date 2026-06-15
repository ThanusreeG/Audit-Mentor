import { LLM_DEFAULTS } from "./llm-config";
import { REQUIRED_LLM_MODEL } from "./llm-model";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CallOptions = {
  route?: string;
  temperature?: number;
  max_tokens?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
  baseUrl?: string;
  stop?: string[];
  callerTag?: string;
};

type LlmOk = { ok: true; content: string; latencyMs: number };
type LlmFail = { ok: false; error: string; latencyMs: number; status?: number; body?: string };

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = REQUIRED_LLM_MODEL;

export class LlmError extends Error {
  detail: string;
  status?: number;
  body?: string;

  constructor(detail: string, status?: number, body?: string) {
    super("LLM unreachable");
    this.detail = detail;
    this.status = status;
    this.body = body;
  }
}

export async function chatCompletion(opts: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  stop?: string[];
  callerTag: string;
  baseUrl?: string;
}): Promise<LlmOk | LlmFail> {
  return callLLM(opts.messages, {
    route: opts.callerTag,
    temperature: opts.temperature ?? LLM_DEFAULTS.temperature,
    maxTokens: opts.maxTokens ?? LLM_DEFAULTS.maxTokens,
    timeoutMs: opts.timeoutMs ?? LLM_DEFAULTS.timeoutMs,
    stop: opts.stop ?? LLM_DEFAULTS.stop,
    baseUrl: opts.baseUrl,
    callerTag: opts.callerTag
  });
}

export async function callLLM(messages: ChatMessage[], opts: CallOptions = {}): Promise<LlmOk | LlmFail> {
  const result = await callLLMOnce(messages, opts);
  if (result.ok || !isTransientLlmError(result.error)) return result;
  if ((opts.retries ?? 1) <= 0) return result;

  await new Promise((resolve) => setTimeout(resolve, 600));
  return callLLMOnce(messages, opts);
}

async function callLLMOnce(messages: ChatMessage[], opts: CallOptions = {}): Promise<LlmOk | LlmFail> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl || process.env.LLM_URL || process.env.LLM_BASE_URL || DEFAULT_BASE_URL);
  const completionUrl = `${baseUrl}${completionPath(baseUrl)}`;
  const model = DEFAULT_MODEL;
  const maxTokens = opts.max_tokens ?? opts.maxTokens ?? LLM_DEFAULTS.maxTokens;
  const timeoutMs = opts.timeoutMs ?? LLM_DEFAULTS.timeoutMs;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const inputPreview = messages.map((message) => message.content).join(" ").slice(0, 200);
  let status: number | undefined;

  try {
    const response = await fetch(completionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY || ""}`,
        "ngrok-skip-browser-warning": "true"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? LLM_DEFAULTS.temperature,
        max_tokens: maxTokens,
        ...(opts.stop?.length ? { stop: opts.stop } : {}),
        stream: false
      }),
      signal: controller.signal
    });
    status = response.status;
    const latencyMs = Date.now() - startedAt;
    const rawText = await response.text();

    if (!response.ok) {
      const body = rawText.slice(0, 500);
      logCall(opts.route, model, latencyMs, status, inputPreview, body, false);
      return { ok: false, error: `HTTP ${response.status}`, status: response.status, body, latencyMs };
    }

    let json: any;
    try {
      json = JSON.parse(rawText);
    } catch {
      const body = rawText.slice(0, 500);
      logCall(opts.route, model, latencyMs, status, inputPreview, body, false);
      return { ok: false, error: "Invalid JSON from LLM", status, body, latencyMs };
    }

    const content = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text;

    if (!content || typeof content !== "string") {
      const body = rawText.slice(0, 500);
      logCall(opts.route, model, latencyMs, status, inputPreview, body, false);
      return { ok: false, error: "No assistant content returned", status, body, latencyMs };
    }

    logCall(opts.route, model, latencyMs, status, inputPreview, content.slice(0, 200), true);
    return { ok: true, content, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Request timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : "Unknown LLM error";
    logCall(opts.route, model, latencyMs, status, inputPreview, message, false);
    return { ok: false, error: message, status, latencyMs };
  } finally {
    clearTimeout(timeout);
  }
}

export async function callLLMJson<T>(messages: ChatMessage[], opts: CallOptions = {}): Promise<T> {
  const first = await callLLM(messages, opts);
  if (!first.ok) throw new LlmError(first.error, first.status, first.body);

  const parsed = parseJsonObject<T>(first.content);
  if (parsed.ok) return parsed.value;

  const retry = await callLLM(
    [
      {
        role: "system",
        content:
          "Return ONLY one valid JSON object. No markdown. No explanation. No code fence. The response must parse with JSON.parse."
      },
      ...messages
    ],
    opts
  );
  if (!retry.ok) throw new LlmError(retry.error, retry.status, retry.body);
  const retryParsed = parseJsonObject<T>(retry.content);
  if (retryParsed.ok) return retryParsed.value;
  throw new LlmError(`Could not parse JSON: ${retryParsed.error}`);
}

function parseJsonObject<T>(content: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    const stripped = content.replace(/```json|```/gi, "").trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { ok: false, error: "No JSON object found" };
    }
    return { ok: true, value: JSON.parse(stripped.slice(start, end + 1)) as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown parse error" };
  }
}

function isTransientLlmError(detail: string) {
  return /HTTP 502|HTTP 503|HTTP 504|timed out|fetch failed|ECONNREFUSED|ECONNRESET/i.test(detail);
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function completionPath(baseUrl: string) {
  if (/\/(chat\/completions|v1\/chat\/completions)$/i.test(baseUrl)) return "";
  if (/api\.deepseek\.com/i.test(baseUrl)) return "/chat/completions";
  return "/v1/chat/completions";
}

function logCall(route = "unknown", model: string, latencyMs: number, status: number | undefined, input: string, output: string, ok: boolean) {
  console.log(
    `[LLM] ${new Date().toISOString()} route=${route} model=${model} ms=${latencyMs} status=${status ?? "n/a"} ok=${ok} input="${sanitize(
      input
    )}" output="${sanitize(output)}"`
  );
}

function sanitize(value: string) {
  return value.replace(/\s+/g, " ").slice(0, 200);
}
