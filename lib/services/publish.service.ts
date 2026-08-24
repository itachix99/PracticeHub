import { prisma } from "../db";
import { z } from "zod";
import { validateExamConfig, type ExamConfig } from "../validation/exam.schema";

export const publishInputSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  slug: z
    .string()
    .min(3)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric with hyphens"
    )
    .optional(),
  organizationId: z.string().optional(),
  sectionName: z.string().min(1).max(100).optional().default("General"),
  config: z.any().optional(), // validated via validateExamConfig if provided
});

export type PublishInput = z.infer<typeof publishInputSchema>;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/--+/g, "-")
      .slice(0, 80)
      .replace(/-+$/g, "") || "exam"
  );
}

export async function publishUpload(params: {
  paperUploadId: string;
  ownerId: string;
  input?: PublishInput;
}) {
  const { paperUploadId, ownerId, input } = params;
  const parsed = publishInputSchema.parse(input ?? {});

  const upload = await prisma.paperUpload.findUnique({
    where: { id: paperUploadId },
    include: { draftQuestions: { orderBy: { order: "asc" } } },
  });
  if (!upload) throw new Error("Upload not found");
  if (upload.ownerId !== ownerId) {
    const user = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!user || (user.role !== "ADMIN" && user.role !== "MODERATOR"))
      throw new Error("Forbidden");
  }

  // Idempotency: if already published and has examId, return existing exam
  if (upload.status === "PUBLISHED" && upload.examId) {
    const existing = await prisma.exam.findUnique({
      where: { id: upload.examId },
      include: { currentVersion: true },
    });
    if (existing) return { exam: existing, alreadyPublished: true };
  }

  // Validate status
  if (upload.status !== "READY" && upload.status !== "REVIEW_REQUIRED") {
    // Allow REVIEW_REQUIRED only if drafts are approved?
    // For now require READY
    throw new Error(
      `Upload must be READY to publish (current: ${upload.status}). Please approve all drafts first.`
    );
  }

  const drafts = await prisma.draftQuestion.findMany({
    where: { paperUploadId, status: "APPROVED" },
    orderBy: { order: "asc" },
  });
  if (drafts.length === 0) throw new Error("No approved drafts to publish");

  const pendingDrafts = await prisma.draftQuestion.count({
    where: { paperUploadId, status: "DRAFT" },
  });
  if (pendingDrafts > 0)
    throw new Error(
      `There are ${pendingDrafts} draft(s) still needing approval. Please approve or reject all before publishing.`
    );

  // Determine title/slug
  const baseTitle =
    parsed.title?.trim() ||
    upload.fileName
      .replace(/\.pdf$/i, "")
      .replace(/[-_]/g, " ")
      .trim() ||
    "Untitled Exam";
  let slug = parsed.slug?.trim() || slugify(baseTitle);
  // Ensure slug unique
  let attempt = 0;
  let finalSlug = slug;
  // Pre-check loop; final uniqueness enforced by catch on P2002 below
  while (await prisma.exam.findUnique({ where: { slug: finalSlug } })) {
    attempt++;
    finalSlug = `${slug}-${attempt}`;
    if (attempt > 20) throw new Error("Failed to generate unique slug");
  }
  slug = finalSlug;

  // Config: use provided or default
  const defaultConfig: ExamConfig = {
    timing: {
      totalSec: Math.min(10800, Math.max(600, drafts.length * 90)),
      warningSec: 300,
    },
    marking: { default: { marks: 1, negative: 0 }, bonusAllowed: true },
    navigation: { mode: "free" },
    questionTypes: [...new Set(drafts.map((d) => d.type))] as string[],
  };
  const configToUse = parsed.config
    ? validateExamConfig(parsed.config)
    : defaultConfig;
  const validatedConfig = validateExamConfig(configToUse);

  if (parsed.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: parsed.organizationId },
    });
    if (!org) throw new Error("Organization not found");
  }
  const sectionName = parsed.sectionName ?? "General";

  // Transaction: create exam, version, section, questions
  const result = await prisma.$transaction(async (tx) => {
    const exam = await tx.exam.create({
      data: {
        slug,
        title: baseTitle,
        organizationId: parsed.organizationId,
        ownerId: upload.ownerId,
        visibility: "PUBLIC",
        isPublished: false,
      },
    });

    const version = await tx.examVersion.create({
      data: {
        examId: exam.id,
        version: 1,
        config: validatedConfig as unknown as never,
        instructions: undefined,
      },
    });

    const section = await tx.examSection.create({
      data: {
        versionId: version.id,
        name: sectionName,
        order: 1,
      },
    });

    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]!;
      const options = (
        typeof d.options === "string"
          ? JSON.parse(d.options as string)
          : (d.options as unknown)
      ) as Array<{ label: string; text: string }>;
      const questionType = (
        [
          "SCQ",
          "MCQ",
          "NUMERIC",
          "TRUE_FALSE",
          "PASSAGE",
          "IMAGE_BASED",
        ] as const
      ).includes(d.type as never)
        ? d.type
        : "SCQ";
      const question = await tx.question.create({
        data: {
          sectionId: section.id,
          order: d.order,
          text: d.text,
          type: questionType as never,
          explanation: d.explanation,
          marks: d.marks ?? 1,
          negativeMarks: 0,
        },
      });

      // Create options and track correct
      let correctOptionId: string | null = null;
      for (let optIdx = 0; optIdx < options.length; optIdx++) {
        const opt = options[optIdx]!;
        const isCorrect =
          !!d.correctOptionLabel && opt.label === d.correctOptionLabel;
        const created = await tx.questionOption.create({
          data: {
            questionId: question.id,
            label: opt.label,
            order: optIdx,
            text: opt.text,
            isCorrect,
          },
        });
        if (isCorrect) correctOptionId = created.id;
      }

      // Create answer if correct
      if (correctOptionId) {
        await tx.answer.create({
          data: {
            questionId: question.id,
            correctOptionId,
            explanation: d.explanation,
          },
        });
      } else if (options.length === 0 && questionType === "NUMERIC") {
        // Numeric: no answer yet, will be filled later
        await tx.answer.create({
          data: {
            questionId: question.id,
            explanation: d.explanation,
          },
        });
      }
    }

    const updatedExam = await tx.exam.update({
      where: { id: exam.id },
      data: { currentVersionId: version.id, isPublished: true },
    });

    await tx.paperUpload.update({
      where: { id: paperUploadId },
      data: { status: "PUBLISHED", examId: exam.id },
    });

    // Update job logs
    const job = await tx.processingJob.findFirst({
      where: { paperUploadId },
      orderBy: { createdAt: "desc" },
    });
    if (job) {
      let logs: Array<{ ts: string; level: string; msg: string }> = [];
      try {
        logs =
          typeof job.logs === "string"
            ? JSON.parse(job.logs as string)
            : (job.logs as typeof logs);
        if (!Array.isArray(logs)) logs = [];
      } catch {}
      logs.push({
        ts: new Date().toISOString(),
        level: "info",
        msg: `Published ${drafts.length} questions as exam ${slug} (version 1)`,
      });
      await tx.processingJob.update({
        where: { id: job.id },
        data: { logs: logs as unknown as never },
      });
    }

    return { exam: updatedExam, version };
  });

  return { exam: result.exam, version: result.version };
}
