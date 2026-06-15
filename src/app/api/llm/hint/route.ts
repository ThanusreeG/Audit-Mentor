import { NextResponse } from "next/server";
import { sanitizeHint } from "@/lib/hint-sanitizer";
import { LLM_DEFAULTS } from "@/lib/llm-config";
import { chatCompletion } from "@/lib/llm";
import { markLlmRoute } from "@/lib/llm-status";
import { hintTutorSystemPrompt } from "@/lib/prompts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    vulnerability?: { title: string; severity: string; codeSnippet?: string; explanation?: string; reveal?: { code?: string; explanation?: string } };
    level?: 1 | 2 | 3;
    llmBaseUrl?: string;
  } | null;

  if (!body?.vulnerability || !body.level) {
    return NextResponse.json({ ok: false, error: "Missing vulnerability or hint level" }, { status: 400 });
  }

  const code = body.vulnerability.reveal?.code || body.vulnerability.codeSnippet || "";
  const explanation = body.vulnerability.reveal?.explanation || body.vulnerability.explanation || "";
  const userPrompt = `Generate one tutoring hint for this smart contract vulnerability.

Hint levels:
- Level 1: Soft direction. Point at the general area or pattern without naming the function.
- Level 2: Stronger pointer. Name the function and suspicious mechanism.
- Level 3: Near-answer. Describe the exact mechanism but do not state the vulnerability title.

Vulnerability: ${body.vulnerability.title}
Severity: ${body.vulnerability.severity}
Vulnerable code:
${code}

True explanation:
${explanation}

Generate hint level ${body.level}.`;
  console.log(`[hint] vuln=${body.vulnerability.title} level=${body.level} requestBytes=${Buffer.byteLength(userPrompt)}`);
  const result = await chatCompletion({
    callerTag: `hint:level-${body.level}`,
    messages: [
      { role: "system", content: hintTutorSystemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: LLM_DEFAULTS.temperature,
    maxTokens: 512,
    timeoutMs: LLM_DEFAULTS.timeoutMs,
    stop: LLM_DEFAULTS.stop,
    baseUrl: body.llmBaseUrl
  });

  if (!result.ok) {
    const outcome = result.error.includes("timed out") ? "timeout" : result.status ? "http-error" : result.error.includes("Invalid JSON") ? "parse-error" : "other";
    console.log(`[hint] llm status=${result.status ?? "n/a"} latencyMs=${result.latencyMs} errorClass=${result.error}`);
    console.log(`[hint] raw=${preview(result.body || "", 300)}`);
    console.log(`[hint] sanitized=`);
    console.log(`[hint] outcome=${outcome}`);
    markLlmRoute("hint", { ok: false, status: result.status || 0, latencyMs: result.latencyMs, lastError: result.error, rawResponse: result.body });
    return NextResponse.json({ ok: false, error: result.error, status: result.status, rawResponse: result.body }, { status: 200 });
  }

  const sanitized = sanitizeHint(result.content);
  const outcome = sanitized ? "live" : "sanitized-empty";
  console.log(`[hint] llm status=200 latencyMs=${result.latencyMs} errorClass=none`);
  console.log(`[hint] raw=${preview(result.content, 300)}`);
  console.log(`[hint] sanitized=${preview(sanitized || "", 300)}`);
  console.log(`[hint] outcome=${outcome}`);
  if (!sanitized) {
    markLlmRoute("hint", {
      ok: false,
      status: 200,
      latencyMs: result.latencyMs,
      lastError: `Sanitizer produced empty hint from raw ${result.content.length} chars response`,
      rawResponse: result.content.slice(0, 500)
    });
    return NextResponse.json(
      { ok: false, error: "LLM hint contained reasoning or could not be cleaned.", rawResponse: result.content.slice(0, 500) },
      { status: 200 }
    );
  }
  markLlmRoute("hint", { ok: true, status: 200, latencyMs: result.latencyMs, rawResponse: result.content.slice(0, 500) });

  return NextResponse.json({ ok: true, hint: sanitized, latencyMs: result.latencyMs, source: "llm" });
}

function preview(value: string, length = 180) {
  return value.replace(/\s+/g, " ").slice(0, length);
}
