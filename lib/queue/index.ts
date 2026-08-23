/**
 * Job queue abstraction — Phase 7 uses direct DB writes (no external queue).
 * Interface allows swapping to pg-boss / BullMQ later without changing callers.
 */
import { prisma } from "../db";
import type { UploadStatus } from "@prisma/client";

export async function enqueueProcessingJob(paperUploadId: string) {
  const job = await prisma.processingJob.create({
    data: {
      paperUploadId,
      status: "PROCESSING",
      attempts: 0,
      logs: JSON.stringify([{ ts: new Date().toISOString(), level: "info", msg: "Job enqueued" }]),
    },
  });
  return job;
}

export async function updateJobStatus(jobId: string, status: UploadStatus, logMsg?: string) {
  const job = await prisma.processingJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job not found");
  let logs: Array<{ ts: string; level: string; msg: string }> = [];
  try { logs = JSON.parse(job.logs); } catch {}
  if (logMsg) logs.push({ ts: new Date().toISOString(), level: "info", msg: logMsg });
  return prisma.processingJob.update({ where: { id: jobId }, data: { status, logs: JSON.stringify(logs) } });
}
