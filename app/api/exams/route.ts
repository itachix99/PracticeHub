import { NextResponse } from "next/server";
import { getPublishedExams } from "@/lib/services/exam.service";
import { sanitizeText } from "@/lib/security/sanitize";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let q = searchParams.get("q") || undefined;
  let organization =
    searchParams.get("organization") || searchParams.get("org") || undefined;
  if (q) {
    q = sanitizeText(q, 100);
    if (q.length === 0) q = undefined;
  }
  if (organization) {
    organization = sanitizeText(organization, 100);
    if (organization.length === 0) organization = undefined;
  }
  const sort =
    (searchParams.get("sort") as
      "latest" | "oldest" | "title" | "popular" | null) || "latest";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "9", 10);
  const result = await getPublishedExams({
    q,
    organization,
    sort: ["latest", "oldest", "title", "popular"].includes(sort)
      ? sort
      : "latest",
    page: isNaN(page) ? 1 : page,
    limit: isNaN(limit) ? 9 : limit,
  });
  return NextResponse.json(result);
}
