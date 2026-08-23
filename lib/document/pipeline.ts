import { prisma } from "../db";
import { getFileBuffer } from "../storage";
import { extractPdfText } from "./extract";

type LogEntry = { ts: string; level: "info" | "warn" | "error"; msg: string };

function parseLogs(raw: string): LogEntry[] {
  try {
    return JSON.parse(raw) as LogEntry[];
  } catch {
    return [];
  }
}

function pushLog(logs: LogEntry[], level: LogEntry["level"], msg: string) {
  logs.push({ ts: new Date().toISOString(), level, msg });
}

export async function runExtractionJob(jobId: string): Promise<void> {
  const job = await prisma.processingJob.findUnique({
    where: { id: jobId },
    include: { paperUpload: true },
  });
  if (!job) throw new Error(`Job ${jobId} not found`);

  const logs = parseLogs(job.logs);
  pushLog(logs, "info", "Starting text extraction (Phase 8)");

  await prisma.processingJob.update({
    where: { id: jobId },
    data: { status: "EXTRACTING", attempts: { increment: 1 }, logs: JSON.stringify(logs) },
  });
  await prisma.paperUpload.update({
    where: { id: job.paperUploadId },
    data: { status: "EXTRACTING" },
  });

  try {
    const buffer = await getFileBuffer(job.paperUpload.fileKey);
    pushLog(logs, "info", `Read file ${job.paperUpload.fileName} (${buffer.length} bytes)`);

    const output = await extractPdfText(buffer);

    pushLog(
      logs,
      "info",
      `Extracted ${output.totalPages} page(s), avg ${output.avgCharsPerPage} chars/page, coverage ${(output.textCoverage * 100).toFixed(1)}%`
    );

    const raw = JSON.stringify({
      totalPages: output.totalPages,
      avgCharsPerPage: output.avgCharsPerPage,
      textCoverage: output.textCoverage,
      needsOcr: output.needsOcr,
      meta: output.meta,
      pages: output.pages.map((p) => ({
        pageNumber: p.pageNumber,
        width: p.width,
        height: p.height,
        charCount: p.charCount,
        hasText: p.hasText,
        preview: p.text.slice(0, 500),
      })),
    });

    const structured = JSON.stringify({
      totalPages: output.totalPages,
      fullText: output.fullText.slice(0, 200000),
      pages: output.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        charCount: p.charCount,
        hasText: p.hasText,
      })),
    });

    const warnings = output.needsOcr
      ? JSON.stringify(["Low text density - scanned PDF detected, needs OCR (Phase 9)"])
      : null;

    const confidence = Math.min(1, output.textCoverage * 0.8 + Math.min(0.2, output.avgCharsPerPage / 2000));

    await prisma.extractionResult.create({
      data: {
        jobId,
        raw,
        structured,
        warnings,
        confidence,
      },
    });

    if (output.needsOcr) {
      pushLog(logs, "warn", "Low text density - flagged needsOcr, awaiting Phase 9 OCR");
    } else {
      pushLog(logs, "info", "Text extraction complete - ready for review");
    }

    await prisma.processingJob.update({
      where: { id: jobId },
      data: { status: "REVIEW_REQUIRED", logs: JSON.stringify(logs) },
    });
    await prisma.paperUpload.update({
      where: { id: job.paperUploadId },
      data: { status: "REVIEW_REQUIRED" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    pushLog(logs, "error", `Extraction failed: ${msg}`);
    await prisma.processingJob.update({
      where: { id: jobId },
      data: { status: "FAILED", logs: JSON.stringify(logs), failedReason: msg },
    });
    await prisma.paperUpload.update({
      where: { id: job.paperUploadId },
      data: { status: "FAILED" },
    });
    throw e;
  }
}
