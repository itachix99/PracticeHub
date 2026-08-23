import { prisma } from "../db";
import { computeScore } from "../exam-engine/scoring";
import type { QuestionState } from "../exam-engine/types";

export async function createAttempt(params: {
  examId: string;
  versionId: string;
  userId?: string | null;
  totalSec: number;
}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + params.totalSec * 1000);
  const attempt = await prisma.examAttempt.create({
    data: {
      examId: params.examId,
      versionId: params.versionId,
      userId: params.userId ?? null,
      status: "IN_PROGRESS",
      startedAt: now,
      expiresAt,
      idempotencyKey: `${params.examId}-${params.versionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
  // Pre-create AttemptAnswer rows for all questions in version
  const sections = await prisma.examSection.findMany({ where: { versionId: params.versionId }, include: { questions: true } });
  const allQuestions = sections.flatMap((s) => s.questions);
  if (allQuestions.length > 0) {
    await prisma.attemptAnswer.createMany({
      data: allQuestions.map((q) => ({
        attemptId: attempt.id,
        questionId: q.id,
        state: "NOT_VISITED" as QuestionState,
        timeSpentMs: 0,
      })),
    });
  }
  return attempt;
}

export async function getAttemptSnapshot(attemptId: string) {
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: { answers: true, version: true, result: true },
  });
  if (!attempt) return null;
  return attempt;
}

export async function saveAttemptAnswers(attemptId: string, answers: Array<{ questionId: string; selectedOptionId: string | null; state: QuestionState; timeSpentMs?: number }>) {
  const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new Error("Attempt not found");
  if (attempt.status !== "IN_PROGRESS") throw new Error("Attempt not in progress");
  if (new Date() >= attempt.expiresAt) {
    // auto-expire
    await prisma.examAttempt.update({ where: { id: attemptId }, data: { status: "EXPIRED" } });
    throw new Error("Attempt expired");
  }
  // Upsert each answer
  await prisma.$transaction(
    answers.map((a) =>
      prisma.attemptAnswer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: a.questionId } },
        update: { selectedOptionId: a.selectedOptionId, state: a.state, timeSpentMs: a.timeSpentMs ?? 0 },
        create: { attemptId, questionId: a.questionId, selectedOptionId: a.selectedOptionId, state: a.state, timeSpentMs: a.timeSpentMs ?? 0 },
      })
    )
  );
  // touch updatedAt
  await prisma.examAttempt.update({ where: { id: attemptId }, data: { updatedAt: new Date() } });
  return true;
}

export async function submitAttempt(attemptId: string, _idempotencyKey?: string) {
  void _idempotencyKey;
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: { answers: true, version: { include: { sections: { include: { questions: { include: { answer: true } } } } } }, result: true },
  });
  if (!attempt) throw new Error("Attempt not found");
  // Idempotent: if already submitted, return existing
  if (attempt.status === "SUBMITTED" && attempt.result) {
    const existing = await prisma.examResult.findUnique({ where: { attemptId } });
    return { attempt, result: existing, alreadySubmitted: true };
  }
  if (attempt.status !== "IN_PROGRESS") throw new Error(`Cannot submit from status ${attempt.status}`);
  // Check expiry — if now > expiresAt, mark expired but still compute score?
  const now = new Date();
  const isExpired = now >= attempt.expiresAt;
  // Build scored questions
  const questionMap = new Map<string, { marks: number; negativeMarks: number; isBonus: boolean; isCancelled: boolean; correctOptionId: string | null; sectionId: string }>();
  for (const sec of attempt.version.sections) {
    for (const q of sec.questions) {
      questionMap.set(q.id, {
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        isBonus: q.isBonus,
        isCancelled: q.isCancelled,
        correctOptionId: q.answer?.correctOptionId ?? null,
        sectionId: sec.id,
      });
    }
  }
  const scored = attempt.answers.map((a) => {
    const q = questionMap.get(a.questionId);
    if (!q) throw new Error(`Question ${a.questionId} not in version`);
    return {
      questionId: a.questionId,
      sectionId: q.sectionId,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      isBonus: q.isBonus,
      isCancelled: q.isCancelled,
      correctOptionId: q.correctOptionId,
      selectedOptionId: a.selectedOptionId,
    };
  });
  let config: { marking?: { default: { marks: number; negative: number }; perSection?: Record<string, { marks: number; negative: number }> } } = {};
  try { config = JSON.parse(attempt.version.config); } catch {}
  const defaultMarking = config.marking?.default ?? { marks: 1, negative: 0 };
  const perSection = config.marking?.perSection;
  const resultScore = computeScore(scored as never, perSection, defaultMarking);
  const timeTakenMs = Math.min(now.getTime() - attempt.startedAt.getTime(), attempt.expiresAt.getTime() - attempt.startedAt.getTime());
  // Create result in transaction + update attempt
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.examResult.findUnique({ where: { attemptId } });
    if (existing) return existing;
    const created = await tx.examResult.create({
      data: {
        attemptId,
        score: resultScore.score,
        maxScore: resultScore.maxScore,
        percentage: resultScore.percentage,
        correct: resultScore.correct,
        incorrect: resultScore.incorrect,
        attempted: resultScore.attempted,
        unattempted: resultScore.unattempted,
        negative: resultScore.negative,
        timeTakenMs,
        sectionWise: JSON.stringify(resultScore.sectionWise),
      },
    });
    await tx.examAttempt.update({
      where: { id: attemptId },
      data: { status: isExpired ? "EXPIRED" : "SUBMITTED", submittedAt: now },
    });
    return created;
  });
  const updatedAttempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } });
  return { attempt: updatedAttempt, result, alreadySubmitted: false };
}
