import { prisma } from "../db";
import { z } from "zod";

export const draftUpdateSchema = z.object({
  text: z.string().min(1).max(4000).optional(),
  type: z.enum(["SCQ","MCQ","NUMERIC","TRUE_FALSE","PASSAGE","IMAGE_BASED"]).optional(),
  options: z.array(z.object({ label: z.string().min(1).max(2), text: z.string().min(1).max(2000) })).max(6).optional(),
  correctOptionLabel: z.string().max(2).nullable().optional(),
  explanation: z.string().max(4000).nullable().optional(),
  marks: z.number().min(0).max(100).optional(),
  needsReview: z.boolean().optional(),
  status: z.enum(["DRAFT","APPROVED","REJECTED"]).optional(),
});

export type DraftUpdateInput = z.infer<typeof draftUpdateSchema>;

export async function getDraftsForUpload(paperUploadId: string) {
  return prisma.draftQuestion.findMany({
    where: { paperUploadId },
    orderBy: { order: "asc" },
  });
}

export async function ensureDraftsExist(paperUploadId: string) {
  const existing = await prisma.draftQuestion.count({ where: { paperUploadId } });
  if (existing > 0) return;
  // Try to hydrate from latest ExtractionResult
  const job = await prisma.processingJob.findFirst({
    where: { paperUploadId },
    orderBy: { createdAt: "desc" },
    include: { results: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const result = job?.results[0];
  if (!result?.structured) return;
  try {
    const structured = JSON.parse(result.structured) as { questions?: Array<{ text: string; type: string; options: Array<{label:string;text:string}>; correctOptionLabel?: string; explanation?: string; marks?: number }> };
    const qs = structured.questions ?? [];
    if (qs.length === 0) return;
    const structuredRaw = JSON.parse(result.raw ?? "{}") as { aiNeedsReview?: boolean };
    const aiNeedsReview = !!structuredRaw.aiNeedsReview;
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i]!;
      await prisma.draftQuestion.create({
        data: {
          paperUploadId,
          order: i+1,
          text: q.text.slice(0,4000),
          type: (["SCQ","MCQ","NUMERIC","TRUE_FALSE","PASSAGE","IMAGE_BASED"] as const).includes(q.type as never) ? q.type as never : "SCQ",
          options: JSON.stringify(q.options ?? []),
          correctOptionLabel: q.correctOptionLabel ?? null,
          explanation: q.explanation ?? null,
          marks: typeof q.marks === "number" ? q.marks : 1,
          needsReview: aiNeedsReview || (q.options.length === 0 && q.type !== "NUMERIC"),
          status: "DRAFT",
        }
      });
    }
  } catch {}
}

export async function updateDraftQuestion(draftId: string, data: DraftUpdateInput) {
  const parsed = draftUpdateSchema.parse(data);
  const update: Record<string, unknown> = {};
  if (parsed.text !== undefined) update.text = parsed.text;
  if (parsed.type !== undefined) update.type = parsed.type;
  if (parsed.options !== undefined) update.options = JSON.stringify(parsed.options);
  if (parsed.correctOptionLabel !== undefined) update.correctOptionLabel = parsed.correctOptionLabel;
  if (parsed.explanation !== undefined) update.explanation = parsed.explanation;
  if (parsed.marks !== undefined) update.marks = parsed.marks;
  if (parsed.needsReview !== undefined) update.needsReview = parsed.needsReview;
  if (parsed.status !== undefined) update.status = parsed.status;
  return prisma.draftQuestion.update({ where: { id: draftId }, data: update });
}

export async function approveAllDrafts(paperUploadId: string) {
  const drafts = await prisma.draftQuestion.findMany({ where: { paperUploadId, status: "DRAFT" } });
  if (drafts.length === 0) {
    // Check if already approved
    const approved = await prisma.draftQuestion.count({ where: { paperUploadId, status: "APPROVED" } });
    if (approved > 0) return { count: approved, already: true };
    throw new Error("No draft questions to approve");
  }
  // Validate each draft has text and at least options for SCQ
  for (const d of drafts) {
    if (!d.text.trim()) throw new Error(`Draft ${d.order} has empty text`);
    const opts = JSON.parse(d.options) as Array<{label:string;text:string}>;
    if (d.type !== "NUMERIC" && opts.length === 0) throw new Error(`Draft ${d.order} needs options`);
  }
  await prisma.draftQuestion.updateMany({ where: { paperUploadId, status: "DRAFT" }, data: { status: "APPROVED", needsReview: false } });
  await prisma.paperUpload.update({ where: { id: paperUploadId }, data: { status: "READY" } });
  // Also update job logs? Append info
  const job = await prisma.processingJob.findFirst({ where: { paperUploadId }, orderBy: { createdAt: "desc" } });
  if (job) {
    let logs: Array<{ts:string;level:string;msg:string}> = [];
    try { logs = JSON.parse(job.logs); } catch {}
    logs.push({ ts: new Date().toISOString(), level: "info", msg: `Review approved ${drafts.length} questions -> READY` });
    await prisma.processingJob.update({ where: { id: job.id }, data: { logs: JSON.stringify(logs) } });
  }
  return { count: drafts.length };
}

export async function rejectDraft(draftId: string) {
  return prisma.draftQuestion.update({ where: { id: draftId }, data: { status: "REJECTED" } });
}
