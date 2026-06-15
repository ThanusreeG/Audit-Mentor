import { NextResponse, type NextRequest } from "next/server";

const DEFAULT_ALLOWED_ORIGINS = "*";
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS;

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(request)
    });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*"
};

function corsHeaders(request: NextRequest) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers") || "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Private-Network": "true"
  };
  const origin = allowedOrigin(request.headers.get("origin"));
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    if (origin !== "*") headers.Vary = "Origin";
  }
  return headers;
}

function allowedOrigin(origin: string | null) {
  if (ALLOWED_ORIGINS.trim() === "*") return "*";
  if (!origin) return "";
  const allowed = ALLOWED_ORIGINS.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : "";
}
