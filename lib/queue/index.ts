/**
 * Job queue abstraction — DB-backed persistent queue for Vercel serverless.
 * Local dev: direct DB row. Production: same DB row but processed via /api/jobs/process or QStash.
 * Consumers call enqueueProcessingJob() then separately claim via claimNextJob() or wait for webhook.
 */
import { prisma } from "../db";
import type { UploadStatus } from "@prisma/client";

const MAX_ATTEMPTS = 3;

export async function enqueueProcessingJob(paperUploadId: string) {
  const job = await prisma.processingJob.create({
    data: {
      paperUploadId,
      status: "PROCESSING" as UploadStatus,
      attempts: 0,
      logs: [
        {
          ts: new Date().toISOString(),
          level: "info",
          msg: "Job enqueued (persistent queue)",
        },
      ] as unknown as never,
    },
  });
  return job;
}

export async function claimNextJob(): Promise<{
  id: string;
  paperUploadId: string;
} | null> {
  // Find oldest PROCESSING job with attempts < MAX and not recently claimed (updatedAt > 5min ago)
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  const job = await prisma.processingJob.findFirst({
    where: {
      status: "PROCESSING",
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ updatedAt: { lt: cutoff } }, { updatedAt: undefined }],
    },
    orderBy: { createdAt: "asc" },
  });
  return job ? { id: job.id, paperUploadId: job.paperUploadId } : null;
}

export async function markJobFailed(jobId: string, reason: string) {
  const job = await prisma.processingJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job not found");
  let logs: Array<{ ts: string; level: string; msg: string }> = [];
  try {
    logs =
      typeof job.logs === "string"
        ? JSON.parse(job.logs as string)
        : (job.logs as typeof logs);
    if (!Array.isArray(logs)) logs = [];
  } catch {
    logs = [];
  }
  logs.push({
    ts: new Date().toISOString(),
    level: "error",
    msg: `FAILED: ${reason}`,
  });
  // Keep only last 500 log entries
  if (logs.length > 500) logs = logs.slice(-500);
  const nextAttempts = job.attempts + 1;
  const isDead = nextAttempts >= MAX_ATTEMPTS;
  return prisma.$transaction(async (tx) => {
    await tx.processingJob.update({
      where: { id: jobId },
      data: {
        status: isDead ? "FAILED" : "PROCESSING",
        attempts: nextAttempts,
        failedReason: reason,
        logs: logs as unknown as never,
      },
    });
    if (isDead) {
      await tx.paperUpload.update({
        where: { id: job.paperUploadId },
        data: { status: "FAILED" },
      });
    }
  });
}

export async function updateJobStatus(
  jobId: string,
  status: UploadStatus,
  logMsg?: string
) {
  const job = await prisma.processingJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job not found");
  let logs: Array<{ ts: string; level: string; msg: string }> = [];
  try {
    logs =
      typeof job.logs === "string"
        ? JSON.parse(job.logs as string)
        : (job.logs as typeof logs);
    if (!Array.isArray(logs)) logs = [];
  } catch {
    logs = [];
  }
  if (logMsg) {
    logs.push({ ts: new Date().toISOString(), level: "info", msg: logMsg });
    if (logs.length > 500) logs = logs.slice(-500);
  }
  return prisma.processingJob.update({
    where: { id: jobId },
    data: { status, logs: logs as unknown as never },
  });
}
