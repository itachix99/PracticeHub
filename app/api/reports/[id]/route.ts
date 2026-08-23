import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateReportStatus, updateReportSchema } from "@/lib/services/report.service";
import { prisma } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  const role = (session?.user as unknown as { role?: string })?.role ?? "STUDENT";
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "MODERATOR" && role !== "ADMIN") return NextResponse.json({ error: "Forbidden - moderator only" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = updateReportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  // Ensure report exists
  const existing = await prisma.report.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  try {
    const updated = await updateReportStatus(id, parsed.data.status);
    return NextResponse.json({ report: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const report = await prisma.report.findUnique({
    where: { id },
    include: { reporter: { select: { id: true, name: true, email: true } }, exam: { select: { id: true, title: true, slug: true } }, question: { select: { id: true, text: true } } },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = (session?.user as unknown as { role?: string })?.role ?? "STUDENT";
  if (report.reporterId !== userId && role !== "MODERATOR" && role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ report });
}
