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
  const trustProxy =
    process.env.TRUST_PROXY === "1" || process.env.VERCEL === "1";
  const xff = req.headers.get("x-forwarded-for");
  if (trustProxy && xff) return xff.split(",")[0]!.trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}

function isCsrfSafe(req: NextRequest): boolean {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS")
    return true;
  if (!req.nextUrl.pathname.startsWith("/api/")) return true;
  // Allow NextAuth CSRF (it handles its own)
  if (req.nextUrl.pathname.startsWith("/api/auth")) return true;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return true; // non-browser or same-site fetch without origin -> allow (SameSite handles)
  try {
    const originHost = new URL(origin).host;
    if (originHost === host) return true;
    // Allow Vercel preview host mismatch? Strict: reject
    return false;
  } catch {
    return false;
  }
}

function sanitizeCallbackUrl(url: string, origin: string): string {
  try {
    const parsed = new URL(url, origin);
    // Only allow same-origin relative paths
    if (parsed.origin !== new URL(origin).origin) return "/dashboard";
    if (parsed.pathname.startsWith("//") || parsed.pathname.includes("\\"))
      return "/dashboard";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return "/dashboard";
  }
}

export function middleware(req: NextRequest) {
  // CSRF check for state-changing API requests
  if (!isCsrfSafe(req)) {
    const res = NextResponse.json(
      { error: "CSRF origin mismatch" },
      { status: 403 }
    );
    return applyHeaders(res);
  }

  const { pathname } = req.nextUrl;

  // --- Rate limiting for API routes ---
  if (pathname.startsWith("/api/")) {
    const ip = clientIp(req);
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
    // Normalize key: strip cuid/id suffix to prevent key proliferation
    const normalizedPath = pathname.replace(/\/c[a-z0-9]{20,}/g, "/:id");
    const key = `${ip}:${normalizedPath}`;
    const rl = checkRateLimit(key, limit, windowMs);
    if (!rl.allowed) {
      const res = NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
      for (const [k, v] of Object.entries(
        rateLimitHeaders(rl.remaining, rl.resetAt, limit)
      ))
        res.headers.set(k, v);
      for (const [k, v] of Object.entries(securityHeaders))
        res.headers.set(k, v);
      res.headers.set(
        "Retry-After",
        String(Math.ceil((rl.resetAt - Date.now()) / 1000))
      );
      return res;
    }
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(
      rateLimitHeaders(rl.remaining, rl.resetAt, limit)
    ))
      res.headers.set(k, v);
    for (const [k, v] of Object.entries(securityHeaders)) res.headers.set(k, v);
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
      const rawCb = req.nextUrl.pathname + req.nextUrl.search;
      const safeCb = sanitizeCallbackUrl(rawCb, req.url);
      loginUrl.searchParams.set("callbackUrl", safeCb);
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
