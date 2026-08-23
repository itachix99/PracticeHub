import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { securityHeaders } from "@/lib/security/headers";

function applyHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(securityHeaders)) {
    res.headers.set(k, v);
  }
  return res;
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- Rate limiting for API routes ---
  if (pathname.startsWith("/api/")) {
    const ip = clientIp(req);
    // Stricter for auth endpoints
    let limit = 60;
    let windowMs = 60_000;
    if (pathname.startsWith("/api/auth")) {
      limit = 20;
      windowMs = 60_000;
    } else if (pathname.startsWith("/api/uploads")) {
      limit = 20;
      windowMs = 60_000;
    } else if (pathname.startsWith("/api/reports")) {
      limit = 30;
      windowMs = 60_000;
    }
    const key = `${ip}:${pathname}`;
    const rl = checkRateLimit(key, limit, windowMs);
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
      for (const [k, v] of Object.entries(rateLimitHeaders(rl.remaining, rl.resetAt, limit))) res.headers.set(k, v);
      for (const [k, v] of Object.entries(securityHeaders)) res.headers.set(k, v);
      res.headers.set("Retry-After", String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
      return res;
    }
    // Attach rate-limit headers to successful response later
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(rateLimitHeaders(rl.remaining, rl.resetAt, limit))) res.headers.set(k, v);
    for (const [k, v] of Object.entries(securityHeaders)) res.headers.set(k, v);
    // Continue to auth checks, but keep headers (need to merge — we return res at end after auth logic for non-API? For API we already return res, but auth redirect not needed)
    // For /api routes, auth is handled per-route (401 JSON), so just add headers and continue
    // To avoid double header set, we will handle API early return already; but for non-early path we need to preserve.
    // Simple: if API route passed rate limit, proceed with headers already set
    // Fall through to auth checks with that response as base
    const authRes = handleAuth(req, res);
    return authRes;
  }

  const res = handleAuth(req);
  return res;
}

function handleAuth(req: NextRequest, base?: NextResponse): NextResponse {
  const sessionToken =
    req.cookies.get("authjs.session-token")?.value ||
    req.cookies.get("__Secure-authjs.session-token")?.value;
  const isLoggedIn = !!sessionToken;
  const { pathname } = req.nextUrl;

  const isPublicRoute =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/exams") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".");

  let res: NextResponse;
  if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
    res = NextResponse.redirect(new URL("/dashboard", req.url));
  } else if (!isPublicRoute) {
    const isProtected = pathname.startsWith("/dashboard");
    if (isProtected && !isLoggedIn) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      res = NextResponse.redirect(loginUrl);
    } else {
      res = base ?? NextResponse.next();
    }
  } else {
    res = base ?? NextResponse.next();
  }
  return applyHeaders(res);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
