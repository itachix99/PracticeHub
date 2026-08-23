import type { NextResponse } from "next/server";

export const securityHeaders: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-DNS-Prefetch-Control": "off",
  "Cross-Origin-Opener-Policy": "same-origin",
  // HSTS only matters over HTTPS; harmless over HTTP
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  // Minimal CSP that does not break Next.js (allows inline scripts/styles needed by Next)
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

export function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(securityHeaders)) {
    res.headers.set(k, v);
  }
  return res;
}
