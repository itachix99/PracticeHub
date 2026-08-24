import type { ScoredQuestion, MarkingResult } from "./types";

/**
 * Server-authoritative scoring.
 * - Bonus/cancelled questions are excluded from maxScore, from negative, and from correct/incorrect accuracy (they contribute 0 to max but still tracked as bonusCorrect for audit).
 * - If a question is not attempted, no marks.
 * - If correct, +marks. If incorrect, -negativeMarks (if not bonus/cancelled).
 * - Percentage is clamped to at least 0? No: negative scores produce negative percentage (intentional for ranking), but capped at 100.
 */
export function computeScore(
  questions: ScoredQuestion[],
  perSectionMarking?: Record<string, { marks: number; negative: number }>,
  defaultMarking: { marks: number; negative: number } = {
    marks: 1,
    negative: 0,
  }
): MarkingResult {
  let score = 0;
  let maxScore = 0;
  let correct = 0;
  let incorrect = 0;
  let attempted = 0;
  let unattempted = 0;
  let negative = 0;
  const sectionMap = new Map<
    string,
    { score: number; max: number; attempted: number; correct: number }
  >();

  for (const q of questions) {
    const isBonusOrCancelled = q.isBonus || q.isCancelled;
    const effectiveNegative = isBonusOrCancelled
      ? 0
      : (perSectionMarking?.[q.sectionId]?.negative ??
        q.negativeMarks ??
        defaultMarking.negative);
    const marksForThis = perSectionMarking?.[q.sectionId]?.marks ?? q.marks;
    const maxForThis = isBonusOrCancelled ? 0 : marksForThis;

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

    const isCorrect =
      q.correctOptionId != null && q.selectedOptionId === q.correctOptionId;
    if (isCorrect) {
      // Bonus/cancelled correct does not increment correct towards percentage max, but track separately? For MVP, we exclude from correct count for accuracy parity.
      if (!isBonusOrCancelled) {
        correct += 1;
        sec.correct += 1;
        score += marksForThis;
        sec.score += marksForThis;
      }
      // else: bonus correct = 0 score, not counted in correct (keeps correct/max aligned)
    } else {
      // Only count incorrect if not bonus/cancelled towards negative max
      if (!isBonusOrCancelled) {
        incorrect += 1;
      }
      const neg = effectiveNegative;
      score -= neg;
      negative += neg;
      sec.score -= neg;
    }
  }

  const rawPercentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const percentage = Math.min(100, rawPercentage); // cap at 100, allow negative
  const sectionWise = Array.from(sectionMap.entries()).map(
    ([sectionId, v]) => ({
      sectionId,
      score: v.score,
      max: v.max,
      attempted: v.attempted,
      correct: v.correct,
      accuracy: v.attempted > 0 ? (v.correct / v.attempted) * 100 : 0,
    })
  );

  return {
    score,
    maxScore,
    correct,
    incorrect,
    attempted,
    unattempted,
    negative,
    percentage,
    sectionWise,
  };
}

export function isPass(
  score: number,
  maxScore: number,
  passingPercentage = 40
): boolean {
  if (maxScore === 0) return false;
  return (score / maxScore) * 100 >= passingPercentage;
}
