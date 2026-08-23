import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const upload = await prisma.paperUpload.findUnique({ where: { id }, include: { jobs: { orderBy: { createdAt: "desc" }, include: { results: true } } } });
  if (!upload) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (upload.ownerId !== userId) {
    // Allow admin/moderator to view? For now check role
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== "ADMIN" && user.role !== "MODERATOR")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  return NextResponse.json({ upload });
}
