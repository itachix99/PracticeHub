import { prisma } from "../db";
import { validateExamConfig } from "../validation/exam.schema";
import type { ExamConfig } from "../validation/exam.schema";

export async function createExamWithVersion(params: {
  slug: string;
  title: string;
  organizationId?: string;
  ownerId: string;
  config: ExamConfig;
  instructions?: string;
  sections: Array<{
    name: string;
    order: number;
    durationSec?: number;
    questions: Array<{
      text: string;
      order: number;
      marks?: number;
      negativeMarks?: number;
      isBonus?: boolean;
      isCancelled?: boolean;
      options: Array<{ label: string; text: string; order: number; isCorrect: boolean }>;
      explanation?: string;
    }>;
  }>;
}) {
  const parsedConfig = validateExamConfig(params.config);
  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.create({
      data: {
        slug: params.slug,
        title: params.title,
        organizationId: params.organizationId,
        ownerId: params.ownerId,
        visibility: "PUBLIC",
        isPublished: false,
      },
    });
    const version = await tx.examVersion.create({
      data: {
        examId: exam.id,
        version: 1,
        config: JSON.stringify(parsedConfig),
        instructions: params.instructions ? JSON.stringify({ text: params.instructions }) : null,
      },
    });
    for (const sec of params.sections) {
      const section = await tx.examSection.create({
        data: { versionId: version.id, name: sec.name, order: sec.order, durationSec: sec.durationSec },
      });
      for (const q of sec.questions) {
        const question = await tx.question.create({
          data: {
            sectionId: section.id,
            order: q.order,
            text: q.text,
            explanation: q.explanation,
            marks: q.marks ?? 1,
            negativeMarks: q.negativeMarks ?? 0.25,
            isBonus: q.isBonus ?? false,
            isCancelled: q.isCancelled ?? false,
            type: "SCQ",
          },
        });
        for (const opt of q.options) {
          await tx.questionOption.create({
            data: { questionId: question.id, label: opt.label, order: opt.order, text: opt.text, isCorrect: opt.isCorrect },
          });
        }
        const correct = q.options.find((o) => o.isCorrect);
        if (correct) {
          const correctOpt = await tx.questionOption.findFirst({ where: { questionId: question.id, label: correct.label } });
          if (correctOpt) {
            await tx.answer.create({ data: { questionId: question.id, correctOptionId: correctOpt.id, explanation: q.explanation } });
          }
        }
      }
    }
    const updated = await tx.exam.update({ where: { id: exam.id }, data: { currentVersionId: version.id, isPublished: true } });
    return { exam: updated, version };
  });
}

export async function getPublishedExams() {
  return prisma.exam.findMany({
    where: { isPublished: true, visibility: "PUBLIC" },
    include: { organization: true, currentVersion: { include: { sections: { include: { questions: { include: { options: true } } } } } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getExamBySlug(slug: string) {
  return prisma.exam.findUnique({
    where: { slug },
    include: {
      organization: true,
      currentVersion: {
        include: {
          sections: { orderBy: { order: "asc" }, include: { questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } }, answer: true, assets: true } } } },
        },
      },
    },
  });
}
