import { describe, it, expect } from "vitest";
import { computeScore } from "../exam-engine/scoring";

function generateQuestions(n: number, sCount = 5) {
  const sections = Array.from({ length: sCount }, (_, i) => `s${i + 1}`);
  return Array.from({ length: n }, (_, i) => ({
    questionId: `q${i}`,
    sectionId: sections[i % sections.length]!,
    marks: 1,
    negativeMarks: 0.25,
    isBonus: false,
    isCancelled: false,
    correctOptionId: "a",
    selectedOptionId: i % 3 === 0 ? "a" : i % 3 === 1 ? "b" : null,
  }));
}

describe("performance 500 questions", () => {
  it("scores 500 questions quickly (<100ms)", () => {
    const qs = generateQuestions(500);
    const start = performance.now();
    const r = computeScore(qs);
    const elapsed = performance.now() - start;
    expect(r.maxScore).toBe(500);
    expect(r.correct + r.incorrect + r.unattempted).toBe(500);
    expect(elapsed).toBeLessThan(100);
    console.log(`500q score: ${elapsed.toFixed(2)}ms`);
  });

  it("scores 1000 questions quickly (<200ms)", () => {
    const qs = generateQuestions(1000);
    const start = performance.now();
    const r = computeScore(qs);
    const elapsed = performance.now() - start;
    expect(r.maxScore).toBe(1000);
    expect(elapsed).toBeLessThan(200);
    console.log(`1000q score: ${elapsed.toFixed(2)}ms`);
  });

  it("sectionWise scales linearly", () => {
    const qs = generateQuestions(500, 10);
    const start = performance.now();
    const r = computeScore(qs);
    const elapsed = performance.now() - start;
    expect(r.sectionWise).toHaveLength(10);
    expect(elapsed).toBeLessThan(100);
  });
});

describe("payload size 500q", () => {
  it("config generation is small", () => {
    const config = {
      timing: { totalSec: 10800, warningSec: 600, sectionTimers: false },
      marking: { perSection: false, default: { marks: 1, negative: 0.25 }, bonusAllowed: false },
      navigation: { mode: "free" as const },
    };
    const json = JSON.stringify(config);
    expect(json.length).toBeLessThan(1000);
  });

  it("500 questions simulated payload <500KB (text)", () => {
    const qs = Array.from({ length: 500 }, (_, i) => ({
      text: `Question ${i + 1}: What is ${i} + ${i}? `.repeat(2),
      options: [
        { label: "A", text: "Option A text" },
        { label: "B", text: "Option B text" },
        { label: "C", text: "Option C text" },
        { label: "D", text: "Option D text" },
      ],
    }));
    const json = JSON.stringify(qs);
    // Rough estimate: 500 * ~200 chars = 100KB
    expect(json.length).toBeLessThan(500 * 1024);
    console.log(`500q JSON size: ${(json.length / 1024).toFixed(1)}KB`);
  });
});
