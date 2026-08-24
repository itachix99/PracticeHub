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
      options: Array<{
        label: string;
        text: string;
        order: number;
        isCorrect: boolean;
      }>;
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
        config: parsedConfig as unknown as never,
        instructions: params.instructions
          ? ({ text: params.instructions } as unknown as never)
          : undefined,
      },
    });
    for (const sec of params.sections) {
      const section = await tx.examSection.create({
        data: {
          versionId: version.id,
          name: sec.name,
          order: sec.order,
          durationSec: sec.durationSec,
        },
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
            data: {
              questionId: question.id,
              label: opt.label,
              order: opt.order,
              text: opt.text,
              isCorrect: opt.isCorrect,
            },
          });
        }
        const correct = q.options.find((o) => o.isCorrect);
        if (correct) {
          const correctOpt = await tx.questionOption.findFirst({
            where: { questionId: question.id, label: correct.label },
          });
          if (correctOpt) {
            await tx.answer.create({
              data: {
                questionId: question.id,
                correctOptionId: correctOpt.id,
                explanation: q.explanation,
              },
            });
          }
        }
      }
    }
    const updated = await tx.exam.update({
      where: { id: exam.id },
      data: { currentVersionId: version.id, isPublished: true },
    });
    return { exam: updated, version };
  }, { timeout: 30000, maxWait: 10000 });
}

export interface PublishedExamsFilters {
  q?: string;
  organization?: string; // slug or id or name
  sort?: "latest" | "oldest" | "title" | "popular";
  page?: number;
  limit?: number;
}

export async function getPublishedExams(filters: PublishedExamsFilters = {}) {
  const { q, organization, sort = "latest", page = 1, limit = 9 } = filters;
  const take = Math.min(50, Math.max(1, Math.min(50, limit)));
  const currentPage = Math.max(1, page);
  const skip = (currentPage - 1) * take;

  const where: Record<string, unknown> = {
    isPublished: true,
    visibility: "PUBLIC",
  };

  if (q && q.trim()) {
    const term = q.trim();
    // For SQLite, contains is case-sensitive but we handle both lower/upper via OR with lower? Simpler: use contains without mode (Prisma handles)
    // Use OR for title/slug contains
    (where as Record<string, unknown>).OR = [
      { title: { contains: term } },
      { slug: { contains: term } },
    ];
  }

  if (organization && organization.trim()) {
    const org = organization.trim();
    // Try to match organization slug, id, or name
    const orgRecord = await prisma.organization.findFirst({
      where: { OR: [{ slug: org }, { id: org }, { name: org }] },
    });
    if (orgRecord) {
      where.organizationId = orgRecord.id;
    } else {
      // If no org found, fallback to slug contains
      where.organization = { slug: { contains: org } };
    }
  }

  let orderBy: Record<string, string> = { createdAt: "desc" };
  if (sort === "oldest") orderBy = { createdAt: "asc" };
  else if (sort === "title") orderBy = { title: "asc" };
  else if (sort === "popular") orderBy = { createdAt: "desc" }; // TODO: sort by attempts count when available

  const [total, exams] = await Promise.all([
    prisma.exam.count({ where: where as never }),
    prisma.exam.findMany({
      where: where as never,
      include: {
        organization: true,
        currentVersion: {
          include: {
            sections: {
              include: { questions: { include: { options: true } } },
            },
          },
        },
      },
      orderBy,
      skip,
      take,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / take));
  return { exams, total, page: currentPage, limit: take, totalPages };
}

export async function getPublishedExamsSimple() {
  // Backwards compat for callers expecting array
  const res = await getPublishedExams({ limit: 100 });
  return res.exams;
}

export async function getExamBySlug(slug: string) {
  return prisma.exam.findUnique({
    where: { slug },
    include: {
      organization: true,
      currentVersion: {
        include: {
          sections: {
            orderBy: { order: "asc" },
            include: {
              questions: {
                orderBy: { order: "asc" },
                include: {
                  options: { orderBy: { order: "asc" } },
                  answer: true,
                  assets: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function getOrganizations() {
  return prisma.organization.findMany({ orderBy: { name: "asc" } });
}