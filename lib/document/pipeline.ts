import { prisma } from "../db";
import { getFileBuffer } from "../storage";
import { extractPdfText, type ExtractionOutput } from "./extract";
import { ocrPdfPagesWithFallback } from "./ocr";
import { extractQuestionsFromText } from "./ai-extract";

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
  pushLog(logs, "info", "Starting text extraction (Phase 8-10)");

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

    const output: ExtractionOutput = await extractPdfText(buffer);

    pushLog(
      logs,
      "info",
      `Extracted ${output.totalPages} page(s), avg ${output.avgCharsPerPage} chars/page, coverage ${(output.textCoverage * 100).toFixed(1)}%`
    );

    // Phase 9: OCR handling if needed
    let ocrProvider: "azure" | "tesseract" | "none" = "none";
    let ocrApplied = false;
    const pagesNeedingOcr = output.pages.filter((p) => !p.hasText).map((p) => p.pageNumber);

    if (output.needsOcr || pagesNeedingOcr.length > 0) {
      const toOcr = pagesNeedingOcr.length > 0 ? pagesNeedingOcr : output.pages.map((p) => p.pageNumber);
      pushLog(logs, "info", `Low text density detected - starting OCR for ${toOcr.length} page(s)`);
      await prisma.processingJob.update({
        where: { id: jobId },
        data: { status: "OCR_PROCESSING", logs: JSON.stringify(logs) },
      });
      await prisma.paperUpload.update({
        where: { id: job.paperUploadId },
        data: { status: "OCR_PROCESSING" },
      });

      try {
        const { map, provider } = await ocrPdfPagesWithFallback(buffer, toOcr, (msg, level = "info") =>
          pushLog(logs, level, msg)
        );
        ocrProvider = provider;
        let mergedChars = 0;
        let mergedWithText = 0;
        for (const page of output.pages) {
          if (map.has(page.pageNumber)) {
            const ocrText = map.get(page.pageNumber) ?? "";
            if (ocrText.trim().length > 0) {
              page.text = ocrText;
              page.charCount = ocrText.trim().length;
              page.hasText = page.charCount >= 50;
              ocrApplied = true;
            }
          }
        }
        for (const p of output.pages) {
          mergedChars += p.charCount;
          if (p.hasText) mergedWithText++;
        }
        output.avgCharsPerPage = output.totalPages > 0 ? Math.round(mergedChars / output.totalPages) : 0;
        output.textCoverage = output.totalPages > 0 ? mergedWithText / output.totalPages : 0;
        output.needsOcr = output.textCoverage < 0.5;
        output.fullText = output.pages.map((p) => p.text).join("\n\n");

        if (ocrApplied) {
          pushLog(logs, "info", `OCR (${provider}) completed - avg now ${output.avgCharsPerPage} chars/page, coverage ${(output.textCoverage * 100).toFixed(1)}%`);
        } else {
          pushLog(logs, "warn", `OCR (${provider}) returned empty - no text recovered`);
        }
      } catch (ocrErr) {
        const msg = ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
        pushLog(logs, "warn", `OCR failed: ${msg} - falling back to text-only`);
      }
    }

    // Phase 10: AI question extraction
    let aiProvider: "openai" | "anthropic" | "mock" = "mock";
    let questionCount = 0;
    let aiNeedsReview = true;
    let aiQuestions: Array<{ text: string; type: string; options: Array<{ label: string; text: string }>; correctOptionLabel?: string }> = [];
    let aiWarnings: string[] | undefined;

    if (output.fullText.trim().length >= 20) {
      pushLog(logs, "info", `Starting AI question extraction for ${output.fullText.length} chars`);
      await prisma.processingJob.update({
        where: { id: jobId },
        data: { status: "AI_EXTRACTING", logs: JSON.stringify(logs) },
      });
      await prisma.paperUpload.update({
        where: { id: job.paperUploadId },
        data: { status: "AI_EXTRACTING" },
      });

      try {
        const aiResult = await extractQuestionsFromText(output.fullText, {
          onLog: (msg, level = "info") => pushLog(logs, level, msg),
        });
        aiProvider = aiResult.provider;
        questionCount = aiResult.questionCount;
        aiNeedsReview = aiResult.needsReview;
        aiQuestions = aiResult.questions;
        aiWarnings = aiResult.warnings;
        pushLog(logs, "info", `AI extraction (${aiProvider}) found ${questionCount} question(s), needsReview=${aiNeedsReview}`);
        if (aiWarnings?.length) pushLog(logs, "warn", `AI warnings: ${aiWarnings.join("; ")}`);
      } catch (aiErr) {
        const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        pushLog(logs, "warn", `AI extraction failed: ${msg} - storing text only`);
        aiWarnings = [`AI failed: ${msg}`];
      }
    } else {
      pushLog(logs, "warn", `Skipping AI extraction - text too short (${output.fullText.length} chars)`);
      aiWarnings = ["Text too short for AI extraction"];
    }

    const raw = JSON.stringify({
      totalPages: output.totalPages,
      avgCharsPerPage: output.avgCharsPerPage,
      textCoverage: output.textCoverage,
      needsOcr: output.needsOcr,
      ocrProvider,
      ocrApplied,
      aiProvider,
      questionCount,
      aiNeedsReview,
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
      questions: aiQuestions,
      questionCount,
      aiProvider,
      aiNeedsReview,
      aiWarnings,
    });

    let warnings: string | null = null;
    const w: string[] = [];
    if (output.needsOcr) w.push("Low text density - still needs review after OCR");
    if (ocrApplied) w.push(`OCR applied via ${ocrProvider}`);
    else if (pagesNeedingOcr.length > 0 && !ocrApplied) w.push("OCR attempted but no text recovered - scanned PDF may need manual review");
    if (aiWarnings?.length) w.push(...aiWarnings);
    if (aiNeedsReview && questionCount > 0) w.push("AI flagged needsReview - verify questions");
    if (questionCount === 0) w.push("No questions extracted - needs manual review");
    if (w.length > 0) warnings = JSON.stringify(w);

    const confidence = Math.min(1, output.textCoverage * 0.8 + Math.min(0.2, output.avgCharsPerPage / 2000) + (ocrApplied ? 0.05 : 0) + (questionCount > 0 && !aiNeedsReview ? 0.05 : 0));

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
      pushLog(logs, "warn", "Still low text density after OCR - flagged for review");
    } else if (aiNeedsReview || questionCount === 0) {
      pushLog(logs, "warn", `AI extraction needs review (${questionCount} questions) - ready for correction`);
    } else {
      pushLog(logs, "info", `Extraction complete: ${questionCount} questions via ${aiProvider} - ready for review`);
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
