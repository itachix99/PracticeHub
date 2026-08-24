import { describe, it, expect } from "vitest";
import { stripHtml, sanitizeText, sanitizeDescription } from "./sanitize";

describe("stripHtml", () => {
  it("removes simple tags", () => {
    expect(stripHtml("<b>hello</b>")).toBe("hello");
  });
  it("removes nested tags", () => {
    expect(stripHtml("<div><span>nested</span> text</div>")).toBe(
      "nested text"
    );
  });
  it("removes script tags but keeps content", () => {
    expect(stripHtml("<script>alert(1)</script>")).toBe("alert(1)");
  });
  it("handles self-closing tags", () => {
    expect(stripHtml("before<br/>after")).toBe("beforeafter");
  });
  it("trims whitespace", () => {
    expect(stripHtml("  <p> hi </p>  ")).toBe("hi");
  });
  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });
  it("handles no tags", () => {
    expect(stripHtml("plain text")).toBe("plain text");
  });
});

describe("sanitizeText", () => {
  it("strips html", () => {
    expect(sanitizeText("<b>bold</b> text", 100)).toBe("bold text");
  });
  it("removes control chars", () => {
    const withControl =
      "hello" + String.fromCharCode(0) + String.fromCharCode(1) + "world";
    expect(sanitizeText(withControl, 100)).toBe("helloworld");
  });
  it("keeps newlines and tabs", () => {
    expect(sanitizeText("a\nb\tc", 100)).toBe("a\nb\tc");
  });
  it("collapses 3+ newlines", () => {
    expect(sanitizeText("a\n\n\n\n b", 100)).toBe("a\n\n b");
  });
  it("truncates to maxLength", () => {
    expect(sanitizeText("a".repeat(10), 5)).toBe("aaaaa");
  });
  it("sanitizes xss payload", () => {
    const xss = "<img src=x onerror=alert(1)>hello";
    const out = sanitizeText(xss, 2000);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toBe("hello");
  });
  it("handles svg xss", () => {
    expect(sanitizeText("<svg onload=alert(1)>", 100)).toBe("");
  });
});

describe("sanitizeDescription", () => {
  it("limits to 2000", () => {
    const long = "a".repeat(3000);
    expect(sanitizeDescription(long).length).toBe(2000);
  });
  it("strips html in description", () => {
    expect(sanitizeDescription("<p>Report <b>text</b></p>")).toBe(
      "Report text"
    );
  });
  it("keeps meaningful text", () => {
    expect(sanitizeDescription("Valid report 123")).toBe("Valid report 123");
  });
});
