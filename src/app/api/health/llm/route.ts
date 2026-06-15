import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { REQUIRED_LLM_MODEL } from "@/lib/llm-model";
import { hintTutorSystemPrompt } from "@/lib/prompts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (process.env.NEXT_STATIC_EXPORT === "true") {
    return NextResponse.json({
      ok: false,
      model: REQUIRED_LLM_MODEL,
      error: "Static frontend build. Configure the backend API base URL to run LLM diagnostics on the MacBook server."
    });
  }

  const started = Date.now();
  void request.url;
  const model = REQUIRED_LLM_MODEL;
  const result = await callLLM(
    [
      { role: "system", content: hintTutorSystemPrompt },
      {
        role: "user",
        content: `Vulnerability: Reentrancy in withdraw
Severity: High
Vulnerable code:
function withdraw(uint256 amount) external { msg.sender.call{value: amount}(""); balance[msg.sender] -= amount; }

Generate hint level 1.`
      }
    ],
    { route: "/api/health/llm", temperature: 0.3, maxTokens: 512, timeoutMs: 20_000 }
  );

  if (result.ok) return NextResponse.json({ ok: true, model, latencyMs: result.latencyMs });

  return NextResponse.json(
    {
      ok: false,
      model,
      latencyMs: Date.now() - started,
      error: result.error,
      status: result.status,
      rawResponse: result.body
    },
    { status: 503 }
  );
}
