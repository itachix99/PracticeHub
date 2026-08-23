import { prisma } from "../db";
import { z } from "zod";

export const reportTypeSchema = z.enum(["WRONG_QUESTION","WRONG_ANSWER","BROKEN_IMAGE","FORMATTING","DUPLICATE","WRONG_EXPLANATION","OTHER"]);

export const createReportSchema = z.object({
  examId: z.string().optional(),
  questionId: z.string().optional(),
  type: reportTypeSchema,
  description: z.string().min(10).max(2000),
}).refine(data => !!data.examId || !!data.questionId, { message: "Either examId or questionId must be provided", path: ["examId"] });

export const updateReportSchema = z.object({
  status: z.enum(["OPEN","RESOLVED","REJECTED"]),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportInput = z.infer<typeof updateReportSchema>;

export async function createReport(params: { reporterId: string } & CreateReportInput) {
  const { reporterId, examId, questionId, type, description } = params;
  // Validate exam/question existence if provided
  if (examId) {
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new Error("Exam not found");
  }
  if (questionId) {
    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) throw new Error("Question not found");
  }
  return prisma.report.create({
    data: {
      reporterId,
      examId: examId || null,
      questionId: questionId || null,
      type: type as never,
      description,
      status: "OPEN",
    },
    include: { reporter: { select: { id: true, name: true, email: true } }, exam: { select: { id: true, title: true, slug: true } }, question: { select: { id: true, text: true } } },
  });
}

export async function getReports(filters: { status?: string; examId?: string; reporterId?: string; role?: string; userId?: string }) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.examId) where.examId = filters.examId;
  // If not moderator/admin, only show own reports
  const isModerator = filters.role === "MODERATOR" || filters.role === "ADMIN";
  if (!isModerator && filters.userId) {
    where.reporterId = filters.userId;
  } else if (filters.reporterId) {
    where.reporterId = filters.reporterId;
  }
  return prisma.report.findMany({
    where: where as never,
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      exam: { select: { id: true, title: true, slug: true } },
      question: { select: { id: true, text: true, order: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateReportStatus(reportId: string, status: "OPEN" | "RESOLVED" | "REJECTED") {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new Error("Report not found");
  return prisma.report.update({
    where: { id: reportId },
    data: { status: status as never },
    include: { reporter: { select: { id: true, email: true } }, exam: true, question: true },
  });
}
