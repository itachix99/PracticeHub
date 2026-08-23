import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createReport, getReports, createReportSchema } from "@/lib/services/report.service";

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session?.user as unknown as { role?: string })?.role ?? "STUDENT";
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const examId = searchParams.get("examId") || undefined;
  const reports = await getReports({ status, examId, role, userId });
  return NextResponse.json({ reports });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  try {
    const report = await createReport({ reporterId: userId, ...parsed.data });
    return NextResponse.json({ report }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
