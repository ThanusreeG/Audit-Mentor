import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildHiddenPracticeProgress } from "@/lib/practice-progress";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    sessionId?: string;
    vulnerabilityOrdinal?: number;
    correct?: boolean;
    hintLevel?: 1 | 2 | 3;
    revealReason?: "correct" | "wrong" | "blank" | "manual";
  } | null;
  if (!body?.sessionId || !body.vulnerabilityOrdinal) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const vulnerability = await prisma.vulnerability.findFirst({
    where: { sessionId: body.sessionId, ordinal: body.vulnerabilityOrdinal }
  });
  if (!vulnerability) return NextResponse.json({ ok: false, error: "Vulnerability not found" }, { status: 404 });

  if (!body.correct && vulnerability.hintsUsed < 3) {
    return NextResponse.json({ ok: false, error: "Reveal locked until all 3 hints are shown." }, { status: 403 });
  }

  const attempts = await prisma.guessAttempt.findMany({
    where: { sessionId: body.sessionId, vulnerabilityId: vulnerability.id }
  });
  const identifiedByUser = Boolean(body.correct) || attempts.some((attempt) => attempt.correct);
  const identifiedHow = identifiedByUser
    ? body.hintLevel === 1
      ? "guessed-after-hint-1"
      : body.hintLevel === 2
        ? "guessed-after-hint-2"
        : "guessed-after-hint-3"
    : "revealed";
  const updated = await prisma.vulnerability.update({
    where: { id: vulnerability.id },
    data: {
      resolved: true,
      identifiedByUser,
      identifiedHow,
      solvedAtHintLevel: identifiedByUser ? body.hintLevel || vulnerability.hintsUsed : null,
      revealedAfterWrong: !identifiedByUser && body.revealReason === "wrong",
      revealedAfterBlank: !identifiedByUser && body.revealReason === "blank"
    },
    select: {
      ordinal: true,
      title: true,
      severity: true,
      codeSnippet: true,
      explanation: true,
      attackScenario: true,
      impact: true,
      fix: true,
      learningNote: true,
      identifiedByUser: true
    }
  });
  const pendingCount = await prisma.vulnerability.count({
    where: { sessionId: body.sessionId, resolved: false }
  });
  const totalCount = await prisma.vulnerability.count({
    where: { sessionId: body.sessionId }
  });

  return NextResponse.json({
    ok: true,
    vulnerability: updated,
    practiceComplete: pendingCount === 0,
    progress: buildHiddenPracticeProgress(totalCount, totalCount - pendingCount)
  });
}
