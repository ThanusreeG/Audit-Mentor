import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (process.env.NEXT_STATIC_EXPORT === "true") {
    return NextResponse.json({
      ok: false,
      service: "ai-audit-assistant-static-frontend",
      error: "Configure the backend API base URL to reach the MacBook server."
    });
  }

  void request.url;
  return NextResponse.json({
    ok: true,
    service: "ai-audit-assistant-backend",
    checkedAt: new Date().toISOString()
  });
}
