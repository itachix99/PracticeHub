import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createAttempt } from "@/lib/services/attempt.service";
import { z } from "zod";

const createSchema = z.object({
  examId: z.string().cuid(),
  versionId: z.string().cuid(),
});

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id ?? null;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  const { examId, versionId } = parsed.data;
  const version = await prisma.examVersion.findUnique({ where: { id: versionId } });
  if (!version || version.examId !== examId) return NextResponse.json({ error: "Version not found for exam" }, { status: 404 });
  let config: { timing: { totalSec: number } } = { timing: { totalSec: 3600 } };
  try { config = JSON.parse(version.config); } catch {}
  const totalSec = config.timing.totalSec;
  if (!totalSec || totalSec <= 0) return NextResponse.json({ error: "Invalid exam timing" }, { status: 400 });
  try {
    const attempt = await createAttempt({ examId, versionId, userId, totalSec });
    return NextResponse.json({ attempt }, { status: 201 });
  } catch (e) {
    console.error("[createAttempt]", e);
    return NextResponse.json({ error: "Failed to create attempt" }, { status: 500 });
  }
}
