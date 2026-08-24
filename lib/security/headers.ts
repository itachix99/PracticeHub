import type { NextResponse } from "next/server";

// Note: CSP is also set in next.config.ts for static headers. Middleware applies these dynamically and can add nonce.
// Tighten script-src: remove wildcard https: when possible; keep unsafe-inline/eval only for Next.js compatibility but document.
export const securityHeaders: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-DNS-Prefetch-Control": "off",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  // CSP: restrict to self + inline (Next.js requires) but no wildcard https: for scripts
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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
