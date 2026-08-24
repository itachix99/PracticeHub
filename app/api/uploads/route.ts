import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { enqueueProcessingJob } from "@/lib/queue";
import {
  checkRateLimit,
  getClientIp,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { sanitizeText } from "@/lib/security/sanitize";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIMES = ["application/pdf"];
const MAX_PAGES = 200;

function estimatePageCount(buffer: Buffer): number {
  // Heuristic: count /Type /Page tokens (not /Pages). Works without full PDF parse.
  const str = buffer.toString("binary");
  const matches = str.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const uploads = await prisma.paperUpload.findMany({
    where: { ownerId: userId },
    include: {
      jobs: { orderBy: { createdAt: "desc" }, include: { results: true } },
      exam: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ uploads });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Per-user rate limit 10 uploads / min
  const ip = getClientIp(req);
  const rl = checkRateLimit(`upload:${userId}:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    const res = NextResponse.json(
      { error: "Too many uploads. Please try again later." },
      { status: 429 }
    );
    for (const [k, v] of Object.entries(
      rateLimitHeaders(rl.remaining, rl.resetAt, 10)
    ))
      res.headers.set(k, v);
    return res;
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file)
    return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (file.size > MAX_SIZE)
    return NextResponse.json(
      { error: "File too large (max 50MB)" },
      { status: 413 }
    );
  if (file.size === 0)
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  // Content-Length header sanity (if present)
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_SIZE + 1024) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  if (
    file.type &&
    !ALLOWED_MIMES.includes(file.type) &&
    file.type !== "application/octet-stream"
  ) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Only PDF allowed` },
        { status: 400 }
      );
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length < 4 || buffer.toString("utf-8", 0, 4) !== "%PDF") {
    return NextResponse.json(
      { error: "Invalid PDF file (missing %PDF header)" },
      { status: 400 }
    );
  }

  if (buffer.includes(Buffer.from("/Encrypt"))) {
    return NextResponse.json(
      { error: "Encrypted PDFs are not supported" },
      { status: 400 }
    );
  }

  // Page count limit (heuristic; avoids parsing entire PDF)
  const pageCount = estimatePageCount(buffer);
  if (pageCount > MAX_PAGES) {
    return NextResponse.json(
      {
        error: `PDF has too many pages (${pageCount} > ${MAX_PAGES}). Maximum ${MAX_PAGES} pages allowed.`,
      },
      { status: 400 }
    );
  }

  // Sanitize source field (prevent stored XSS)
  const rawSource = (formData.get("source") as string) || null;
  const source = rawSource ? sanitizeText(rawSource, 500) : null;

  let stored;
  try {
    stored = await saveFile(buffer, file.name);
  } catch (e) {
    console.error("[upload save]", e);
    return NextResponse.json(
      { error: "Failed to store file" },
      { status: 500 }
    );
  }

  try {
    const paperUpload = await prisma.paperUpload.create({
      data: {
        ownerId: userId,
        fileKey: stored.key,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        sizeBytes: file.size,
        status: "UPLOADED",
        source,
      },
    });
    const job = await enqueueProcessingJob(paperUpload.id);
    await prisma.paperUpload.update({
      where: { id: paperUpload.id },
      data: { status: "PROCESSING" },
    });
    // Persistent queue: job is now PROCESSING in DB. For local dev, try to run inline with waitUntil-style fire-and-forget that survives response;
    // in production, /api/jobs/process (cron/QStash) will claim and run it if this inline fails due to timeout.
    // Using queue abstraction ensures the job is not lost when serverless terminates.
    const { runExtractionJob } = await import("@/lib/document/pipeline");
    // Intentionally not awaiting: keep response fast, but rely on DB-persisted job for retry.
    // Vercel: use `waitUntil` if available, else rely on cron.
    const maybeWaitUntil = (
      globalThis as unknown as { waitUntil?: (p: Promise<unknown>) => void }
    ).waitUntil;
    if (maybeWaitUntil) {
      maybeWaitUntil(
        runExtractionJob(job.id).catch((err) =>
          console.error("[extraction] background failed", err)
        )
      );
    } else {
      runExtractionJob(job.id).catch((err) =>
        console.error("[extraction] background failed", err)
      );
    }
    return NextResponse.json({ paperUpload, job }, { status: 201 });
  } catch (e) {
    console.error("[upload db]", e);
    return NextResponse.json(
      { error: "Failed to create upload record" },
      { status: 500 }
    );
  }
}
