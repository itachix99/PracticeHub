import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { enqueueProcessingJob } from "@/lib/queue";
import { runExtractionJob } from "@/lib/document/pipeline";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIMES = ["application/pdf"];

export async function GET() {
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const uploads = await prisma.paperUpload.findMany({
    where: { ownerId: userId },
    include: { jobs: { orderBy: { createdAt: "desc" }, include: { results: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ uploads });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 413 });
  if (file.size === 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });

  // MIME check (client can spoof, so also check magic bytes)
  if (file.type && !ALLOWED_MIMES.includes(file.type) && file.type !== "application/octet-stream") {
    // Allow if extension is pdf but mime is weird, we will check magic bytes next
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: `Invalid file type: ${file.type}. Only PDF allowed` }, { status: 400 });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Magic byte check: PDF must start with %PDF
  if (buffer.length < 4 || buffer.toString("utf-8", 0, 4) !== "%PDF") {
    return NextResponse.json({ error: "Invalid PDF file (missing %PDF header)" }, { status: 400 });
  }

  // Encrypted PDF check: look for /Encrypt
  if (buffer.includes(Buffer.from("/Encrypt"))) {
    return NextResponse.json({ error: "Encrypted PDFs are not supported" }, { status: 400 });
  }

  // Save file
  let stored;
  try {
    stored = await saveFile(buffer, file.name);
  } catch (e) {
    console.error("[upload save]", e);
    return NextResponse.json({ error: "Failed to store file" }, { status: 500 });
  }

  // Create PaperUpload + Job
  try {
    const paperUpload = await prisma.paperUpload.create({
      data: {
        ownerId: userId,
        fileKey: stored.key,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        sizeBytes: file.size,
        status: "UPLOADED",
        source: (formData.get("source") as string) || null,
      },
    });
    const job = await enqueueProcessingJob(paperUpload.id);
    await prisma.paperUpload.update({ where: { id: paperUpload.id }, data: { status: "PROCESSING" } });
    // Phase 8: fire text extraction in background (no await to keep upload responsive)
    runExtractionJob(job.id).catch((err) => console.error("[extraction] background failed", err));
    return NextResponse.json({ paperUpload, job }, { status: 201 });
  } catch (e) {
    console.error("[upload db]", e);
    return NextResponse.json({ error: "Failed to create upload record" }, { status: 500 });
  }
}
