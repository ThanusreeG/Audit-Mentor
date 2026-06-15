import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { callLLMJson, LlmError } from "@/lib/llm";
import { reportSystemPrompt } from "@/lib/prompts";

type ReportQualitative = {
  strengths: string[];
  weaknesses: string[];
  improvementSuggestions: string[];
  nextTopics: string[];
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { sessionId?: string } | null;
  if (!body?.sessionId) return NextResponse.json({ ok: false, error: "Missing sessionId" }, { status: 400 });

  const session = await prisma.auditSession.findUnique({
    where: { id: body.sessionId },
    include: { vulnerabilities: true, attempts: true }
  });
  if (!session) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });

  const total = session.vulnerabilities.length;
  const correctlyIdentified = session.vulnerabilities.filter((vulnerability) => vulnerability.identifiedByUser).length;
  const missed = session.vulnerabilities.filter((vulnerability) => vulnerability.resolved && !vulnerability.identifiedByUser).length;
  const incorrectSuspicions = session.attempts.filter((attempt) => !attempt.correct).length;
  const hintsUsed = session.vulnerabilities.reduce((totalHints, vulnerability) => totalHints + vulnerability.hintsUsed, 0);
  const appGuided = session.vulnerabilities.filter((vulnerability) => vulnerability.appGuided).length;
  const identifiedOnHint1 = session.vulnerabilities.filter((vulnerability) => vulnerability.solvedAtHintLevel === 1).length;
  const identifiedOnHint2 = session.vulnerabilities.filter((vulnerability) => vulnerability.solvedAtHintLevel === 2).length;
  const identifiedOnHint3 = session.vulnerabilities.filter((vulnerability) => vulnerability.solvedAtHintLevel === 3).length;
  const identifiedAfterHints = session.vulnerabilities.filter(
    (vulnerability) => vulnerability.solvedAtHintLevel === 2 || vulnerability.solvedAtHintLevel === 3
  ).length;
  const revealedWithoutCorrect = session.vulnerabilities.filter(
    (vulnerability) => vulnerability.resolved && !vulnerability.identifiedByUser
  ).length;
  const revealedAfterWrong = session.vulnerabilities.filter((vulnerability) => vulnerability.revealedAfterWrong).length;
  const revealedAfterBlank = session.vulnerabilities.filter((vulnerability) => vulnerability.revealedAfterBlank).length;
  const totalWrongGuesses = session.vulnerabilities.reduce((totalWrong, vulnerability) => totalWrong + vulnerability.wrongGuessCount, 0);
  const breakdown = session.vulnerabilities.map((vulnerability) => ({
    title: vulnerability.title,
    severity: vulnerability.severity,
    identifiedHow: vulnerability.identifiedHow || "unresolved",
    solvedAtHintLevel: vulnerability.solvedAtHintLevel,
    wrongGuesses: vulnerability.wrongGuessCount
  }));
  const gotRight = session.vulnerabilities.filter((vulnerability) => vulnerability.identifiedByUser).map((v) => v.title);
  const gotWrong = session.vulnerabilities.filter((vulnerability) => !vulnerability.identifiedByUser).map((v) => v.title);

  try {
    const qualitative = await callLLMJson<ReportQualitative>(
      [
        { role: "system", content: reportSystemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            stats: {
              total,
              correctlyIdentified,
              missed,
              incorrectSuspicions,
              hintsUsed,
              appGuided,
              identifiedOnHint1,
              identifiedOnHint2,
              identifiedOnHint3,
              identifiedAfterHints,
              revealedWithoutCorrect,
              totalWrongGuesses
            },
            breakdown,
            gotRight,
            gotWrong,
            userSummary: session.userSummary
          })
        }
      ],
      { route: "/api/report", maxTokens: 1800 }
    );

    return NextResponse.json({
      ok: true,
      stats: {
        total,
        correctlyIdentified,
        missed,
        incorrectSuspicions,
        hintsUsed,
        appGuided,
        identifiedOnHint1,
        identifiedOnHint2,
        identifiedOnHint3,
        identifiedAfterHints,
        revealedWithoutCorrect,
        revealedAfterWrong,
        revealedAfterBlank,
        totalWrongGuesses,
        breakdown,
        userSummary: session.userSummary || ""
      },
      qualitative
    });
  } catch (error) {
    if (error instanceof LlmError) {
      return NextResponse.json({
        ok: true,
        stats: {
          total,
          correctlyIdentified,
          missed,
          incorrectSuspicions,
          hintsUsed,
          appGuided,
          identifiedOnHint1,
          identifiedOnHint2,
          identifiedOnHint3,
          identifiedAfterHints,
          revealedWithoutCorrect,
          revealedAfterWrong,
          revealedAfterBlank,
          totalWrongGuesses,
          breakdown,
          userSummary: session.userSummary || ""
        },
        qualitative: buildFallbackReport({ identifiedOnHint1, identifiedAfterHints, revealedWithoutCorrect, totalWrongGuesses }),
        fallback: true,
        notice: "Live LLM report generation is unavailable, so this report uses deterministic performance feedback."
      });
    }
    return NextResponse.json({ ok: false, error: "Report failed" }, { status: 500 });
  }
}

function buildFallbackReport({
  identifiedOnHint1,
  identifiedAfterHints,
  revealedWithoutCorrect,
  totalWrongGuesses
}: {
  identifiedOnHint1: number;
  identifiedAfterHints: number;
  revealedWithoutCorrect: number;
  totalWrongGuesses: number;
}) {
  return {
    strengths:
      identifiedOnHint1 > 0
        ? ["You identified at least one issue from the first hint, which shows strong pattern recognition."]
        : ["You stayed engaged through the hint ladder and reached the reveal stage."],
    weaknesses:
      revealedWithoutCorrect > 0
        ? ["Some vulnerabilities needed full reveal, so focus on mapping hints to concrete bug classes."]
        : ["Most answers were eventually connected to the right issue."],
    improvementSuggestions: [
      totalWrongGuesses > 0
        ? "When guessing, name both the function and the mechanism, such as external call before state update."
        : "Keep practicing by explaining the exact exploit path before revealing the answer.",
      identifiedAfterHints > 0 ? "Review why later hints made the issue clearer and turn those clues into a checklist." : "Try harder contracts with signatures, oracles, and token accounting."
    ],
    nextTopics: ["Access control checks", "Reentrancy patterns", "Signature replay", "ERC20 accounting edge cases"]
  };
}
