import { describe, it, expect } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  it("allows first request", () => {
    const key = "rl-test-allow-" + Math.random();
    const r = checkRateLimit(key, 5, 60000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });
  it("blocks after limit", () => {
    const key = "rl-test-block-" + Math.random();
    checkRateLimit(key, 2, 60000);
    checkRateLimit(key, 2, 60000);
    const r3 = checkRateLimit(key, 2, 60000);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });
  it("isolates different keys", () => {
    const k1 = "rl-iso-1-" + Math.random();
    const k2 = "rl-iso-2-" + Math.random();
    checkRateLimit(k1, 1, 60000);
    const r1 = checkRateLimit(k1, 1, 60000);
    const r2 = checkRateLimit(k2, 1, 60000);
    expect(r1.allowed).toBe(false);
    expect(r2.allowed).toBe(true);
  });
  it("respects different limits", () => {
    const key = "rl-diff-" + Math.random();
    const r1 = checkRateLimit(key, 10, 60000);
    expect(r1.remaining).toBe(9);
    checkRateLimit(key, 10, 60000);
    const r3 = checkRateLimit(key, 10, 60000);
    expect(r3.remaining).toBe(7);
  });
  it("expires after window", async () => {
    const key = "rl-expire-" + Math.random();
    checkRateLimit(key, 1, 10);
    let r = checkRateLimit(key, 1, 10);
    expect(r.allowed).toBe(false);
    await new Promise((res) => setTimeout(res, 15));
    r = checkRateLimit(key, 1, 10);
    expect(r.allowed).toBe(true);
  });
  it("remaining never negative", () => {
    const key = "rl-neg-" + Math.random();
    checkRateLimit(key, 1, 60000);
    const r2 = checkRateLimit(key, 1, 60000);
    const r3 = checkRateLimit(key, 1, 60000);
    expect(r2.remaining).toBe(0);
    expect(r3.remaining).toBe(0);
  });
});
