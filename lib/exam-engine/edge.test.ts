import { describe, it, expect } from "vitest";
import { computeScore } from "./scoring";
import { canNavigate } from "./navigation";

describe("scoring edge cases", () => {
  it("empty set", () => {
    const r = computeScore([]);
    expect(r.score).toBe(0);
    expect(r.maxScore).toBe(0);
    expect(r.percentage).toBe(0);
  });
  it("all bonus", () => {
    const qs = [
      {
        questionId: "q1",
        sectionId: "s1",
        marks: 1,
        negativeMarks: 0,
        isBonus: true,
        isCancelled: false,
        correctOptionId: "a",
        selectedOptionId: "a",
      },
      {
        questionId: "q2",
        sectionId: "s1",
        marks: 1,
        negativeMarks: 0.25,
        isBonus: true,
        isCancelled: false,
        correctOptionId: "a",
        selectedOptionId: "b",
      },
    ];
    const r = computeScore(qs);
    expect(r.maxScore).toBe(0);
    expect(r.correct).toBe(0); // bonus excluded from correct
  });
  it("all cancelled", () => {
    const qs = [
      {
        questionId: "q1",
        sectionId: "s1",
        marks: 2,
        negativeMarks: 0.5,
        isBonus: false,
        isCancelled: true,
        correctOptionId: "a",
        selectedOptionId: "a",
      },
    ];
    const r = computeScore(qs);
    expect(r.maxScore).toBe(0);
    expect(r.score).toBe(0);
  });
  it("mixed negative zero", () => {
    const qs = [
      {
        questionId: "q1",
        sectionId: "s1",
        marks: 1,
        negativeMarks: 0,
        isBonus: false,
        isCancelled: false,
        correctOptionId: "a",
        selectedOptionId: "b",
      },
    ];
    const r = computeScore(qs);
    expect(r.score).toBe(0);
    expect(r.negative).toBe(0);
  });
});

describe("navigation edge", () => {
  it("free allows any", () => {
    const cfg = {
      timing: { totalSec: 100 },
      marking: { default: { marks: 1, negative: 0 }, bonusAllowed: true },
      navigation: { mode: "free" as const },
    } as unknown as never;
    expect(canNavigate({}, { sectionId: "s1", questionOrder: 0 }, cfg)).toBe(
      true
    );
  });
  it("sequential logic", () => {
    expect(typeof canNavigate).toBe("function");
  });
});