import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sanitizeHint } from "@/lib/hint-sanitizer";
import { LLM_DEFAULTS } from "@/lib/llm-config";
import { chatCompletion } from "@/lib/llm";
import { markLlmRoute } from "@/lib/llm-status";
import { buildHiddenPracticeProgress } from "@/lib/practice-progress";
import { hintTutorSystemPrompt } from "@/lib/prompts";

type HintLevel = 1 | 2 | 3;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    sessionId?: string;
    vulnerabilityOrdinal?: number | null;
    level?: HintLevel;
    llmBaseUrl?: string;
  } | null;
  if (!body?.sessionId || !body.level) {
    return NextResponse.json({ ok: false, error: "Missing sessionId or hint level" }, { status: 400 });
  }

  const vulnerability = body.vulnerabilityOrdinal
    ? await prisma.vulnerability.findFirst({
        where: { sessionId: body.sessionId, ordinal: body.vulnerabilityOrdinal, resolved: false }
      })
    : await prisma.vulnerability.findFirst({
        where: { sessionId: body.sessionId, resolved: false },
        orderBy: { ordinal: "asc" }
      });

  if (!vulnerability) {
    return NextResponse.json({ ok: true, practiceComplete: true, progress: await practiceProgress(body.sessionId) });
  }

  const userPrompt = `Generate one tutoring hint for this smart contract vulnerability.

Hint levels:
- Level 1: Soft direction. Point at the general area or pattern without naming the function.
- Level 2: Stronger pointer. Name the function and suspicious mechanism.
- Level 3: Near-answer. Describe the exact mechanism but do not state the vulnerability title.

Vulnerability: ${vulnerability.title}
Severity: ${vulnerability.severity}
Vulnerable code:
${vulnerability.codeSnippet}

True explanation:
${vulnerability.explanation}

Generate hint level ${body.level}.`;
  console.log(`[hint] vuln=${vulnerability.id} level=${body.level} requestBytes=${Buffer.byteLength(userPrompt)}`);
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

  if (result.ok) {
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
      return fallbackResponse(vulnerability, body.level, "LLM hint contained reasoning or could not be cleaned.");
    }
    markLlmRoute("hint", { ok: true, status: 200, latencyMs: result.latencyMs, rawResponse: result.content.slice(0, 500) });

    const updated = await prisma.vulnerability.update({
      where: { id: vulnerability.id },
      data: {
        hintsUsed: Math.max(vulnerability.hintsUsed, body.level),
        ...hintUpdate(body.level, sanitized)
      }
    });

    return NextResponse.json({
      ok: true,
      activeVulnerabilityOrdinal: updated.ordinal,
      level: body.level,
      hint: sanitized,
      progress: await practiceProgress(body.sessionId),
      source: "llm"
    });
  }

  const outcome = result.error.includes("timed out") ? "timeout" : result.status ? "http-error" : result.error.includes("Invalid JSON") ? "parse-error" : "other";
  console.log(`[hint] llm status=${result.status ?? "n/a"} latencyMs=${result.latencyMs} errorClass=${result.error}`);
  console.log(`[hint] raw=${preview(result.body || "", 300)}`);
  console.log(`[hint] sanitized=`);
  console.log(`[hint] outcome=${outcome}`);
  markLlmRoute("hint", {
    ok: false,
    status: result.status || 0,
    latencyMs: result.latencyMs,
    lastError: result.error,
    rawResponse: result.body
  });
  return fallbackResponse(vulnerability, body.level, result.error, result.status, result.body);
}

async function fallbackResponse(
  vulnerability: NonNullable<Awaited<ReturnType<typeof prisma.vulnerability.findFirst>>>,
  level: HintLevel,
  llmError: string,
  status?: number,
  rawResponse?: string
) {
  const fallbackHint = getStoredHint(vulnerability, level);
  const updated = await prisma.vulnerability.update({
    where: { id: vulnerability.id },
    data: { hintsUsed: Math.max(vulnerability.hintsUsed, level) }
  });

  return NextResponse.json({
    ok: true,
    activeVulnerabilityOrdinal: updated.ordinal,
    level,
    hint: fallbackHint,
    progress: await practiceProgress(vulnerability.sessionId),
    fallback: true,
    source: "cached-hint",
    llmError,
    status,
    rawResponse,
    notice: "Hint generation is unavailable — click the LLM status in the header for details."
  });
}

function hintUpdate(level: HintLevel, hint: string) {
  if (level === 1) return { hint1: hint };
  if (level === 2) return { hint2: hint };
  return { hint3: hint };
}

function getStoredHint(vulnerability: { hint1: string; hint2: string; hint3: string }, level: HintLevel) {
  if (level === 1) return vulnerability.hint1;
  if (level === 2) return vulnerability.hint2;
  return vulnerability.hint3;
}

async function practiceProgress(sessionId: string) {
  const [total, resolved] = await Promise.all([
    prisma.vulnerability.count({ where: { sessionId } }),
    prisma.vulnerability.count({ where: { sessionId, resolved: true } })
  ]);
  return buildHiddenPracticeProgress(total, resolved);
}

function preview(value: string, length = 180) {
  return value.replace(/\s+/g, " ").slice(0, length);
}
