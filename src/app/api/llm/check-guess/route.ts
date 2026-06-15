import { NextResponse } from "next/server";
import { localCheckGuess } from "@/lib/local-guess-check";
import { LLM_DEFAULTS } from "@/lib/llm-config";
import { chatCompletion } from "@/lib/llm";
import { markLlmRoute } from "@/lib/llm-status";
import { strictGuessJudgeSystemPrompt } from "@/lib/prompts";

export const runtime = "nodejs";

type JudgeResult = { correct: boolean; reasoning: string };

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      guess?: string;
      vulnerability?: {
        title: string;
        severity?: string;
        matchKeywords?: string[] | string;
        codeSnippet?: string;
        explanation?: string;
        reveal?: { code?: string; explanation?: string };
      };
    } | null;

    if (!body?.vulnerability || typeof body.guess !== "string" || !body.guess.trim()) {
      return NextResponse.json({
        ok: true,
        correct: false,
        reasoning: "Missing guess or vulnerability data.",
        source: "error"
      });
    }

    const code = body.vulnerability.reveal?.code || body.vulnerability.codeSnippet || "";
    const explanation = body.vulnerability.reveal?.explanation || body.vulnerability.explanation || "";
    const result = await chatCompletion({
      callerTag: "check-guess",
      messages: [
        { role: "system", content: strictGuessJudgeSystemPrompt },
        {
          role: "user",
          content: `Target vulnerability: ${body.vulnerability.title}
Vulnerable code:
${code}

True explanation: ${explanation}

User's guess: "${body.guess}"

Is this guess correct?`
        }
      ],
      temperature: 0,
      maxTokens: 512,
      timeoutMs: LLM_DEFAULTS.timeoutMs,
      stop: LLM_DEFAULTS.stop
    });

    if (result.ok) {
      const parsed = parseJudge(result.content);
      if (parsed) {
        markLlmRoute("checkGuess", { ok: true, status: 200, latencyMs: result.latencyMs, rawResponse: result.content.slice(0, 500) });
        return NextResponse.json({ ok: true, ...parsed, source: "llm" });
      }
    }
    markLlmRoute("checkGuess", {
      ok: false,
      status: result.ok ? 200 : result.status || 0,
      latencyMs: result.latencyMs,
      lastError: result.ok ? "Invalid JSON from LLM judge" : result.error,
      rawResponse: result.ok ? result.content.slice(0, 500) : result.body
    });

    const fallback = localCheckGuess(body.guess, body.vulnerability);
    return NextResponse.json({
      ok: true,
      correct: fallback.correct,
      reasoning: result.ok ? "The LLM returned unclear JSON, so this was checked locally. " + fallback.reasoning : fallback.reasoning,
      source: "local-fallback",
      llmError: result.ok ? "Invalid JSON from LLM judge" : result.error,
      status: result.ok ? undefined : result.status,
      rawResponse: result.ok ? result.content.slice(0, 500) : result.body
    });
  } catch (error) {
    console.error("[check-guess] unexpected error:", error);
    return NextResponse.json({
      ok: true,
      correct: false,
      reasoning: "Could not verify your guess due to a server error. Treat this as wrong and try again.",
      source: "error"
    });
  }
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
