import { NextResponse } from "next/server";
import { getPublishedExams } from "@/lib/services/exam.service";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || undefined;
  const organization = searchParams.get("organization") || searchParams.get("org") || undefined;
  const sort = (searchParams.get("sort") as "latest" | "oldest" | "title" | "popular" | null) || "latest";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "9", 10);
  const result = await getPublishedExams({
    q,
    organization,
    sort: ["latest","oldest","title","popular"].includes(sort) ? sort : "latest",
    page: isNaN(page) ? 1 : page,
    limit: isNaN(limit) ? 9 : limit,
  });
  // Keep backward compat: also support simple array via ?simple=true? but not needed
  return NextResponse.json(result);
}
