import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { approveAllDrafts } from "@/lib/services/draft.service";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const upload = await prisma.paperUpload.findUnique({ where: { id } });
  if (!upload) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (upload.ownerId !== userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== "ADMIN" && user.role !== "MODERATOR")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (upload.status !== "REVIEW_REQUIRED" && upload.status !== "READY") {
    // Allow approve only when review required, but also allow re-approve if already READY (idempotent)
    const pending = await prisma.draftQuestion.count({ where: { paperUploadId: id, status: "DRAFT" } });
    if (pending === 0) {
      // Already ready, return ok
      return NextResponse.json({ ok: true, message: "Already approved" });
    }
  }
  try {
    const result = await approveAllDrafts(id);
    return NextResponse.json({ ok: true, approved: result.count, already: (result as { already?: boolean }).already });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
