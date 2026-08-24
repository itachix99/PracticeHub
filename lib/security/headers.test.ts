import { describe, it, expect } from "vitest";
import { securityHeaders } from "./headers";

describe("securityHeaders", () => {
  it("has X-Frame-Options DENY", () => {
    expect(securityHeaders["X-Frame-Options"]).toBe("DENY");
  });
  it("has HSTS", () => {
    expect(securityHeaders["Strict-Transport-Security"]).toContain("max-age");
  });
  it("has CSP with frame-ancestors none", () => {
    expect(securityHeaders["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'"
    );
  });
  it("has nosniff", () => {
    expect(securityHeaders["X-Content-Type-Options"]).toBe("nosniff");
  });
  it("has referrer policy", () => {
    expect(securityHeaders["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin"
    );
  });
  it("has permissions policy", () => {
    expect(securityHeaders["Permissions-Policy"]).toContain("camera");
  });
});
