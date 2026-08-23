import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const exams = await prisma.exam.findMany({
    where: { isPublished: true, visibility: "PUBLIC" },
    include: { organization: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ exams });
}
