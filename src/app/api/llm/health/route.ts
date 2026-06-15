import { NextResponse } from "next/server";
import { LLM_DEFAULTS } from "@/lib/llm-config";
import { chatCompletion } from "@/lib/llm";
import { getLlmHealthSnapshot, markLlmRoute } from "@/lib/llm-status";
import { REQUIRED_LLM_MODEL } from "@/lib/llm-model";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (process.env.NEXT_STATIC_EXPORT === "true") {
    return NextResponse.json({
      ok: false,
      overall: "down",
      model: REQUIRED_LLM_MODEL,
      error: "Static frontend build. Configure the backend API base URL to run LLM diagnostics on the MacBook server."
    });
  }

  const url = new URL(request.url);
  const baseUrl = url.searchParams.get("baseUrl") || undefined;
  const model = REQUIRED_LLM_MODEL;
  await probeHealth(baseUrl, model);
  await probeHint(baseUrl, model);
  await probeCheckGuess(baseUrl, model);
  return NextResponse.json({ ok: getLlmHealthSnapshot().overall !== "down", model, ...getLlmHealthSnapshot() });
}

async function probeHealth(baseUrl?: string, model?: string) {
  const result = await chatCompletion({
    callerTag: "health",
    messages: [
      { role: "system", content: "Answer directly. Do not show reasoning. Do not include a preface." },
      {
        role: "user",
        content:
          "Health probe for a smart contract audit tutor. Read this synthetic vulnerability context and reply with exactly OK. Contract area: bridge claim, token accounting, oracle read, signature digest, external call. The purpose is to verify that the same model path used for hints can handle a realistic tutoring prompt of a few hundred tokens without failing, timing out, or returning only hidden reasoning. Do not explain. Do not include markdown. Do not include any other word."
      }
    ],
    temperature: LLM_DEFAULTS.temperature,
    maxTokens: 512,
    timeoutMs: LLM_DEFAULTS.timeoutMs,
    stop: LLM_DEFAULTS.stop,
    baseUrl
  });

  if (result.ok) {
    if (!/\bOK\b/i.test(result.content)) {
      markLlmRoute("health", {
        ok: false,
        status: 200,
        latencyMs: result.latencyMs,
        lastError: "LLM responded, but not with the expected health-check text. Check the model name or server chat template.",
        rawResponse: result.content.slice(0, 500)
      });
      return;
    }
    markLlmRoute("health", { ok: true, status: 200, latencyMs: result.latencyMs, rawResponse: result.content.slice(0, 500) });
    return;
  }

  markLlmRoute("health", {
    ok: false,
    status: result.status || 0,
    latencyMs: result.latencyMs,
    lastError: enrichModelError(result.error, model || REQUIRED_LLM_MODEL, result.body),
    rawResponse: result.body
  });
}

async function probeHint(baseUrl?: string, model?: string) {
  const result = await chatCompletion({
    callerTag: "hint:health-probe",
    messages: [
      { role: "system", content: "You are a security tutor. Output only one short hint in plain prose." },
      {
        role: "user",
        content:
          "Generate a level 1 hint for this vulnerability. Vulnerability: Reentrancy risk in withdrawal flow. Severity: High. Vulnerable code: function withdraw(uint256 amount) external { (bool ok,) = msg.sender.call{value: amount}(\"\"); require(ok); balance[msg.sender] -= amount; }. True explanation: Ether is sent to a user-controlled address before the internal balance is updated. The hint should help a beginner notice the ordering of external calls and state updates without naming the vulnerability."
      }
    ],
    temperature: LLM_DEFAULTS.temperature,
    maxTokens: 512,
    timeoutMs: LLM_DEFAULTS.timeoutMs,
    stop: LLM_DEFAULTS.stop,
    baseUrl
  });
  markLlmRoute("hint", result.ok ? { ok: true, status: 200, latencyMs: result.latencyMs, rawResponse: result.content.slice(0, 500) } : { ok: false, status: result.status || 0, latencyMs: result.latencyMs, lastError: result.error, rawResponse: result.body });
}

async function probeCheckGuess(baseUrl?: string, model?: string) {
  const result = await chatCompletion({
    callerTag: "check-guess:health-probe",
    messages: [
      { role: "system", content: "Output only valid JSON on one line." },
      {
        role: "user",
        content:
          'Target vulnerability: Reentrancy risk in withdrawal flow. Vulnerable code: msg.sender.call{value: amount}(""); balance[msg.sender] -= amount;. True explanation: external call before state update. User guess: "withdraw sends ETH before updating balance". Return {"correct":true,"reasoning":"short reason"}.'
      }
    ],
    temperature: 0,
    maxTokens: 512,
    timeoutMs: LLM_DEFAULTS.timeoutMs,
    stop: LLM_DEFAULTS.stop,
    baseUrl
  });
  markLlmRoute("checkGuess", result.ok ? { ok: true, status: 200, latencyMs: result.latencyMs, rawResponse: result.content.slice(0, 500) } : { ok: false, status: result.status || 0, latencyMs: result.latencyMs, lastError: result.error, rawResponse: result.body });
}

function enrichModelError(error: string, model: string, body = "") {
  if (/404|model.*not.*found|not.*found.*model/i.test(`${error} ${body}`)) {
    return `The configured model "${model}" was not found on the server. Confirm the exact model name loaded by your LLM server.`;
  }
  return error;
}
