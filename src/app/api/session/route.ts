import { NextResponse } from "next/server";
import { getAuditSessionView } from "@/lib/audit-session-view";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (process.env.NEXT_STATIC_EXPORT === "true") {
    return NextResponse.json({
      ok: false,
      error: "Static frontend build. Configure the backend API base URL to load audit sessions from the MacBook server."
    });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") || "";
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing sessionId" }, { status: 400 });
  }

  const session = await getAuditSessionView(sessionId);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, session });
}
