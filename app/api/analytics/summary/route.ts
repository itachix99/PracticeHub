import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getStudentStats,
  getRecentAttempts,
  getUploaderStats,
  getDailyAttempts,
} from "@/lib/services/analytics.service";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [student, recent, uploader, daily] = await Promise.all([
    getStudentStats(userId),
    getRecentAttempts(userId, 5),
    getUploaderStats(userId),
    getDailyAttempts(userId, 7),
  ]);
  return NextResponse.json({ student, recent, uploader, daily });
}
