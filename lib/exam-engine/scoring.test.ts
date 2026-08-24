import { describe, it, expect } from "vitest";
import { computeScore } from "./scoring";
import { nextQuestionState } from "./states";
import { isExpired, remainingMs, formatRemaining } from "./timer";
import { canNavigate } from "./navigation";

describe("computeScore", () => {
  it("scores all correct", () => {
    const qs = [
      {
        questionId: "q1",
        sectionId: "s1",
        marks: 2,
        negativeMarks: 0.5,
        isBonus: false,
        isCancelled: false,
        correctOptionId: "a",
        selectedOptionId: "a",
      },
      {
        questionId: "q2",
        sectionId: "s1",
        marks: 2,
        negativeMarks: 0.5,
        isBonus: false,
        isCancelled: false,
        correctOptionId: "b",
        selectedOptionId: "b",
      },
    ];
    const r = computeScore(qs);
    expect(r.score).toBe(4);
    expect(r.maxScore).toBe(4);
    expect(r.correct).toBe(2);
    expect(r.incorrect).toBe(0);
    expect(r.negative).toBe(0);
    expect(r.percentage).toBe(100);
  });

  it("applies negative marking", () => {
    const qs = [
      {
        questionId: "q1",
        sectionId: "s1",
        marks: 2,
        negativeMarks: 0.5,
        isBonus: false,
        isCancelled: false,
        correctOptionId: "a",
        selectedOptionId: "b",
      },
      {
        questionId: "q2",
        sectionId: "s1",
        marks: 2,
        negativeMarks: 0.5,
        isBonus: false,
        isCancelled: false,
        correctOptionId: "a",
        selectedOptionId: null,
      },
    ];
    const r = computeScore(qs);
    expect(r.score).toBe(-0.5);
    expect(r.maxScore).toBe(4);
    expect(r.correct).toBe(0);
    expect(r.incorrect).toBe(1);
    expect(r.attempted).toBe(1);
    expect(r.unattempted).toBe(1);
    expect(r.negative).toBe(0.5);
  });

  it("excludes bonus and cancelled from max and score", () => {
    const qs = [
      {
        questionId: "q1",
        sectionId: "s1",
        marks: 2,
        negativeMarks: 0.5,
        isBonus: true,
        isCancelled: false,
        correctOptionId: "a",
        selectedOptionId: "a",
      },
      {
        questionId: "q2",
        sectionId: "s1",
        marks: 2,
        negativeMarks: 0.5,
        isBonus: false,
        isCancelled: true,
        correctOptionId: "a",
        selectedOptionId: "b",
      },
      {
        questionId: "q3",
        sectionId: "s1",
        marks: 2,
        negativeMarks: 0.5,
        isBonus: false,
        isCancelled: false,
        correctOptionId: "a",
        selectedOptionId: "a",
      },
    ];
    const r = computeScore(qs);
    expect(r.maxScore).toBe(2); // only q3 counts
    expect(r.score).toBe(2);
    expect(r.correct).toBe(1); // bonus correct excluded from correct count (keeps correct/max aligned)
  });

  it("sectionWise breakdown", () => {
    const qs = [
      {
        questionId: "q1",
        sectionId: "s1",
        marks: 1,
        negativeMarks: 0,
        isBonus: false,
        isCancelled: false,
        correctOptionId: "a",
        selectedOptionId: "a",
      },
      {
        questionId: "q2",
        sectionId: "s2",
        marks: 1,
        negativeMarks: 0,
        isBonus: false,
        isCancelled: false,
        correctOptionId: "a",
        selectedOptionId: "b",
      },
    ];
    const r = computeScore(qs);
    expect(r.sectionWise).toHaveLength(2);
    const s1 = r.sectionWise.find((s) => s.sectionId === "s1")!;
    expect(s1.score).toBe(1);
    expect(s1.accuracy).toBe(100);
    const s2 = r.sectionWise.find((s) => s.sectionId === "s2")!;
    expect(s2.score).toBe(0);
    expect(s2.accuracy).toBe(0);
  });
});

describe("states", () => {
  it("transitions", () => {
    expect(nextQuestionState("NOT_VISITED", "visit", false)).toBe(
      "NOT_ANSWERED"
    );
    expect(nextQuestionState("NOT_ANSWERED", "answer", true)).toBe("ANSWERED");
    expect(nextQuestionState("ANSWERED", "mark", true)).toBe("ANSWERED_MARKED");
    expect(nextQuestionState("NOT_ANSWERED", "mark", false)).toBe("MARKED");
    expect(nextQuestionState("ANSWERED_MARKED", "clear", true)).toBe("MARKED");
  });
});

describe("timer", () => {
  it("remaining and expiry", () => {
    const now = new Date("2024-01-01T10:00:00Z");
    const expires = new Date("2024-01-01T11:00:00Z");
    expect(isExpired(expires, now)).toBe(false);
    expect(remainingMs(expires, now)).toBe(3600 * 1000);
    expect(formatRemaining(3661000)).toBe("01:01:01");
    expect(formatRemaining(125000)).toBe("02:05");
  });
});

describe("navigation", () => {
  it("free mode allows all", () => {
    const config = {
      timing: { totalSec: 3600 },
      marking: { default: { marks: 1, negative: 0 }, bonusAllowed: true },
      navigation: { mode: "free" as const },
      questionTypes: ["SCQ"],
    };
    expect(canNavigate({}, { sectionId: "s2", questionOrder: 5 }, config)).toBe(
      true
    );
  });
  it("section-lock blocks backward", () => {
    const config = {
      timing: { totalSec: 3600 },
      marking: { default: { marks: 1, negative: 0 }, bonusAllowed: true },
      navigation: {
        mode: "section-lock" as const,
        sectionOrder: ["s1", "s2", "s3"],
      },
      questionTypes: ["SCQ"],
    };
    expect(
      canNavigate({}, { sectionId: "s1", questionOrder: 0 }, config, "s2")
    ).toBe(false);
    expect(
      canNavigate({}, { sectionId: "s3", questionOrder: 0 }, config, "s2")
    ).toBe(true);
  });
});
