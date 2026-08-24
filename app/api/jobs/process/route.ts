import { NextResponse } from "next/server";
import { runExtractionJob } from "@/lib/document/pipeline";
import { prisma } from "@/lib/db";

// POST /api/jobs/process — claims next PROCESSING job and runs pipeline.
// Protected by CRON_SECRET or internal call; for MVP allow without auth but rate-limited via middleware.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const cronHeader = req.headers.get("x-cron-secret");
    const provided = auth?.replace(/^Bearer\s+/i, "") || cronHeader || "";
    if (provided !== secret)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Claim oldest PROCESSING job
  const job = await prisma.processingJob.findFirst({
    where: { status: "PROCESSING" },
    orderBy: { createdAt: "asc" },
  });
  if (!job)
    return NextResponse.json({ claimed: false, message: "No pending jobs" });
  // Prevent double-run: check attempts threshold already handled in queue
  try {
    await runExtractionJob(job.id);
    return NextResponse.json({ claimed: true, jobId: job.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { claimed: true, jobId: job.id, error: msg },
      { status: 500 }
    );
  }
}

export async function GET() {
  const pending = await prisma.processingJob.count({
    where: { status: "PROCESSING" },
  });
  const failed = await prisma.processingJob.count({
    where: { status: "FAILED" },
  });
  const recent = await prisma.processingJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, status: true, paperUploadId: true, createdAt: true },
  });
  return NextResponse.json({ pending, failed, recent });
}
