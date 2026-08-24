import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getDraftsForUpload,
  ensureDraftsExist,
} from "@/lib/services/draft.service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const upload = await prisma.paperUpload.findUnique({ where: { id } });
  if (!upload)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (upload.ownerId !== userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== "ADMIN" && user.role !== "MODERATOR"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await ensureDraftsExist(id);
  const drafts = await getDraftsForUpload(id);
  // Also return upload status and extraction info
  const uploadWithJobs = await prisma.paperUpload.findUnique({
    where: { id },
    include: {
      jobs: { orderBy: { createdAt: "desc" }, include: { results: true } },
    },
  });
  return NextResponse.json({
    drafts: drafts.map((d) => ({
      ...d,
      options:
        typeof d.options === "string"
          ? JSON.parse(d.options as string)
          : (d.options as unknown),
    })),
    upload: uploadWithJobs,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const upload = await prisma.paperUpload.findUnique({ where: { id } });
  if (!upload)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (upload.ownerId !== userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== "ADMIN" && user.role !== "MODERATOR"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  // Expect { updates: Array<{ id, text?, options?, ... }> }
  if (!body || !Array.isArray(body.updates))
    return NextResponse.json(
      { error: "Invalid body: expected { updates: [...] }" },
      { status: 400 }
    );
  const { draftUpdateSchema } = await import("@/lib/services/draft.service");
  const { prisma: prismaClient } = await import("@/lib/db");
  const results = [];
  for (const u of body.updates) {
    if (!u.id) continue;
    const data = { ...u };
    delete data.id;
    const parsed = draftUpdateSchema.partial().safeParse(data);
    if (!parsed.success)
      return NextResponse.json(
        {
          error: `Invalid update for ${u.id}`,
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    // Ensure draft belongs to this upload
    const draft = await prismaClient.draftQuestion.findUnique({
      where: { id: u.id },
    });
    if (!draft || draft.paperUploadId !== id)
      return NextResponse.json(
        { error: `Draft ${u.id} not found for this upload` },
        { status: 404 }
      );
    const updateData: Record<string, unknown> = {};
    if (parsed.data.text !== undefined) updateData.text = parsed.data.text;
    if (parsed.data.type !== undefined) updateData.type = parsed.data.type;
    if (parsed.data.options !== undefined)
      updateData.options = parsed.data.options as unknown as never;
    if (parsed.data.correctOptionLabel !== undefined)
      updateData.correctOptionLabel = parsed.data.correctOptionLabel;
    if (parsed.data.explanation !== undefined)
      updateData.explanation = parsed.data.explanation;
    if (parsed.data.marks !== undefined) updateData.marks = parsed.data.marks;
    if (parsed.data.needsReview !== undefined)
      updateData.needsReview = parsed.data.needsReview;
    if (parsed.data.status !== undefined)
      updateData.status = parsed.data.status;
    const updated = await prismaClient.draftQuestion.update({
      where: { id: u.id },
      data: updateData,
    });
    results.push({
      ...updated,
      options:
        typeof updated.options === "string"
          ? JSON.parse(updated.options as string)
          : updated.options,
    });
  }
  return NextResponse.json({ drafts: results });
}
