import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadAnalysisArtifact } from "@/lib/analysis-store";
import { callLLMJson } from "@/lib/llm";
import { summaryReviewSystemPrompt } from "@/lib/prompts";

type SummaryReview = {
  ok?: boolean;
  feedback?: string;
  missedConcepts?: string[];
  nextFocus?: string[];
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    sessionId?: string;
    summary?: string;
    llmBaseUrl?: string;
  } | null;
  if (!body?.sessionId) return NextResponse.json({ ok: false, error: "Missing sessionId" }, { status: 400 });

  const session = await prisma.auditSession.update({
    where: { id: body.sessionId },
    data: { userSummary: body.summary || "" },
    select: {
      contractSource: true,
      contractType: true,
      detectedSignals: true
    }
  });

  if (!body.summary?.trim()) {
    return NextResponse.json({ ok: true, feedback: null });
  }

  const savedAnalysis = await loadAnalysisArtifact(body.sessionId);
  const savedUnderstanding = savedAnalysis
    ? {
        contractType: savedAnalysis.contractType,
        summary: savedAnalysis.summary,
        handlesFunds: savedAnalysis.handlesFunds,
        features: savedAnalysis.features,
        riskReasonCategories: savedAnalysis.riskReasonCategories,
        lineCount: savedAnalysis.lineCount,
        analysisMode: savedAnalysis.analysisMode
      }
    : null;

  try {
    const review = await callLLMJson<SummaryReview>(
      [
        { role: "system", content: summaryReviewSystemPrompt },
        {
          role: "user",
          content: `Contract type: ${savedAnalysis?.contractType || session.contractType || "Unknown"}
Detected metadata: ${session.detectedSignals || "{}"}
Saved backend understanding, without hidden finding details:
${JSON.stringify(savedUnderstanding || {}, null, 2)}

Solidity source:
${session.contractSource}

Beginner summary:
${body.summary}`
        }
      ],
      {
        route: "summary-review",
        callerTag: "summary-review",
        temperature: 0.2,
        maxTokens: 800,
        timeoutMs: 35_000,
        baseUrl: body.llmBaseUrl
      }
    );

    return NextResponse.json({ ok: true, feedback: sanitizeSummaryFeedback(review.feedback || "") });
  } catch (error) {
    console.error("[summary] LLM review failed", error);
    return NextResponse.json({
      ok: true,
      feedback: "Your summary was saved, but the LLM could not review it right now.",
      source: "llm-error"
    });
  }
}

function sanitizeSummaryFeedback(feedback: string) {
  const trimmed = feedback.trim();
  if (!trimmed) return "";
  if (SUMMARY_SPOILER_PATTERN.test(trimmed)) {
    return "Your summary was saved. Before practice, make sure you can explain the contract purpose, important roles, important state variables, where funds enter and leave, external dependencies, and any special validation logic at a high level.";
  }
  return trimmed;
}

const SUMMARY_SPOILER_PATTERN =
  /\b(vulnerab|bug|issue|flaw|exploit|attacker|attack|unsafe|broken|reentrancy|reenter|replay|stale|tx\.origin|recoverSigner|skim|onlyOwner|access control|unchecked|malicious|drain|bypass|missing|non-standard|suspicious)\b/i;
