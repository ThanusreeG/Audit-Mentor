import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadAnalysisArtifact } from "@/lib/analysis-store";
import { localCheckGuess } from "@/lib/local-guess-check";
import { LLM_DEFAULTS } from "@/lib/llm-config";
import { chatCompletion } from "@/lib/llm";
import { markLlmRoute } from "@/lib/llm-status";
import { strictGuessJudgeSystemPrompt } from "@/lib/prompts";

type JudgeResult = { correct: boolean; reasoning: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    sessionId?: string;
    vulnerabilityOrdinal?: number;
    userInput?: string;
    hintLevel?: 1 | 2 | 3;
  } | null;

  if (!body?.sessionId || !body.vulnerabilityOrdinal || !body.hintLevel) {
    return NextResponse.json({ ok: false, error: "Missing sessionId, vulnerability, or hint level" }, { status: 400 });
  }

  const vulnerability = await prisma.vulnerability.findFirst({
    where: { sessionId: body.sessionId, ordinal: body.vulnerabilityOrdinal, resolved: false }
  });
  if (!vulnerability) return NextResponse.json({ ok: false, error: "Active vulnerability not found" }, { status: 404 });

  const userInput = body.userInput?.trim() || "";
  if (!userInput) {
    return NextResponse.json({ ok: true, correct: false, blank: true, reasoning: "No answer submitted." });
  }

  const savedAnalysis = await loadAnalysisArtifact(body.sessionId);
  const savedFinding = savedAnalysis?.vulnerabilities.find((finding) => finding.ordinal === body.vulnerabilityOrdinal);
  const target = savedFinding || vulnerability;

  const result = await chatCompletion({
    callerTag: "check-guess",
    messages: [
      { role: "system", content: strictGuessJudgeSystemPrompt },
      {
        role: "user",
        content: `Saved session analysis summary: ${savedAnalysis?.summary || "Unavailable"}
Target vulnerability: ${target.title}
Vulnerable code:
${target.codeSnippet}

True explanation: ${target.explanation}

User's guess: "${userInput}"

Is this guess correct?`
      }
    ],
    temperature: 0,
    maxTokens: 512,
    timeoutMs: LLM_DEFAULTS.timeoutMs,
    stop: LLM_DEFAULTS.stop
  });

  const judgment = result.ok ? parseJudge(result.content) : null;
  if (judgment && result.ok) {
    markLlmRoute("checkGuess", { ok: true, status: 200, latencyMs: result.latencyMs, rawResponse: result.content.slice(0, 500) });
  } else {
    markLlmRoute("checkGuess", {
      ok: false,
      status: result.ok ? 200 : result.status || 0,
      latencyMs: result.latencyMs,
      lastError: result.ok ? "Invalid JSON from LLM judge" : result.error,
      rawResponse: result.ok ? result.content.slice(0, 500) : result.body
    });
  }
  const verdict = judgment || localCheckGuess(userInput, vulnerability);
  const correct = Boolean(verdict.correct);

  await prisma.guessAttempt.create({
    data: { sessionId: body.sessionId, vulnerabilityId: vulnerability.id, userInput, correct }
  });
  if (!correct) {
    await prisma.vulnerability.update({
      where: { id: vulnerability.id },
      data: { wrongGuessCount: { increment: 1 } }
    });
  }

  return NextResponse.json({
    ok: true,
    correct,
    reasoning: verdict.reasoning || (correct ? "Correct." : "Not quite."),
    source: judgment ? "llm" : "local-fallback",
    fallback: !judgment,
    llmError: result.ok ? (judgment ? undefined : "Invalid JSON from LLM judge") : result.error,
    status: result.ok ? undefined : result.status,
    rawResponse: result.ok ? (judgment ? undefined : result.content.slice(0, 500)) : result.body
  });
}

function parseJudge(content: string): JudgeResult | null {
  try {
    const stripped = content.replace(/```json|```/gi, "").trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    return { correct: Boolean(parsed.correct), reasoning: String(parsed.reasoning || "") };
  } catch {
    return null;
  }
}
