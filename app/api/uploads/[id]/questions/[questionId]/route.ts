import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { draftUpdateSchema } from "@/lib/services/draft.service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; questionId: string }> }) {
  const { id, questionId } = await params;
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const upload = await prisma.paperUpload.findUnique({ where: { id } });
  if (!upload) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (upload.ownerId !== userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== "ADMIN" && user.role !== "MODERATOR")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const draft = await prisma.draftQuestion.findUnique({ where: { id: questionId } });
  if (!draft || draft.paperUploadId !== id) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = draftUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (parsed.data.text !== undefined) data.text = parsed.data.text;
  if (parsed.data.type !== undefined) data.type = parsed.data.type;
  if (parsed.data.options !== undefined) data.options = JSON.stringify(parsed.data.options);
  if (parsed.data.correctOptionLabel !== undefined) data.correctOptionLabel = parsed.data.correctOptionLabel;
  if (parsed.data.explanation !== undefined) data.explanation = parsed.data.explanation;
  if (parsed.data.marks !== undefined) data.marks = parsed.data.marks;
  if (parsed.data.needsReview !== undefined) data.needsReview = parsed.data.needsReview;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  const updated = await prisma.draftQuestion.update({ where: { id: questionId }, data });
  return NextResponse.json({ draft: { ...updated, options: JSON.parse(updated.options) } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; questionId: string }> }) {
  const { id, questionId } = await params;
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const upload = await prisma.paperUpload.findUnique({ where: { id } });
  if (!upload) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (upload.ownerId !== userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== "ADMIN" && user.role !== "MODERATOR")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const draft = await prisma.draftQuestion.findUnique({ where: { id: questionId } });
  if (!draft || draft.paperUploadId !== id) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  await prisma.draftQuestion.delete({ where: { id: questionId } });
  return NextResponse.json({ ok: true });
}
