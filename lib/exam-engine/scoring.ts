import type { ScoredQuestion, MarkingResult } from "./types";

/**
 * Server-authoritative scoring.
 * - Bonus/cancelled questions are excluded from maxScore and from negative.
 * - If a question is not attempted, no marks.
 * - If correct, +marks. If incorrect, -negativeMarks (if not bonus/cancelled).
 * - Never mutate exam definition — this is pure.
 */
export function computeScore(
  questions: ScoredQuestion[],
  perSectionMarking?: Record<string, { marks: number; negative: number }>,
  defaultMarking: { marks: number; negative: number } = { marks: 1, negative: 0 }
): MarkingResult {
  let score = 0;
  let maxScore = 0;
  let correct = 0;
  let incorrect = 0;
  let attempted = 0;
  let unattempted = 0;
  let negative = 0;
  const sectionMap = new Map<string, { score: number; max: number; attempted: number; correct: number }>();

  for (const q of questions) {
    const effectiveNegative = q.isBonus || q.isCancelled ? 0 : (perSectionMarking?.[q.sectionId]?.negative ?? q.negativeMarks ?? defaultMarking.negative);
    const marksForThis = perSectionMarking?.[q.sectionId]?.marks ?? q.marks;
    const maxForThis = q.isBonus || q.isCancelled ? 0 : marksForThis;

    maxScore += maxForThis;

    let sec = sectionMap.get(q.sectionId);
    if (!sec) {
      sec = { score: 0, max: 0, attempted: 0, correct: 0 };
      sectionMap.set(q.sectionId, sec);
    }
    sec.max += maxForThis;

    if (q.selectedOptionId == null) {
      unattempted += 1;
      continue;
    }
    attempted += 1;
    sec.attempted += 1;

    const isCorrect = q.correctOptionId != null && q.selectedOptionId === q.correctOptionId;
    if (isCorrect) {
      correct += 1;
      sec.correct += 1;
      const awarded = q.isBonus || q.isCancelled ? 0 : marksForThis;
      score += awarded;
      sec.score += awarded;
    } else {
      incorrect += 1;
      const neg = effectiveNegative;
      score -= neg;
      negative += neg;
      sec.score -= neg;
    }
  }

  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const sectionWise = Array.from(sectionMap.entries()).map(([sectionId, v]) => ({
    sectionId,
    score: v.score,
    max: v.max,
    attempted: v.attempted,
    correct: v.correct,
    accuracy: v.attempted > 0 ? (v.correct / v.attempted) * 100 : 0,
  }));

  return { score, maxScore, correct, incorrect, attempted, unattempted, negative, percentage, sectionWise };
}

export function isPass(score: number, maxScore: number, passingPercentage = 40): boolean {
  if (maxScore === 0) return false;
  return (score / maxScore) * 100 >= passingPercentage;
}
