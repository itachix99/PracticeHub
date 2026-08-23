import { getPublishedExams, getOrganizations } from "@/lib/services/exam.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Clock, FileText, Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { ExamFilters } from "@/components/exams/exam-filters";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  organization?: string;
  sort?: string;
  page?: string;
  limit?: string;
}

export default async function ExamsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const organization = params.organization?.trim() || undefined;
  const sort = (params.sort as "latest" | "oldest" | "title" | "popular" | undefined) || "latest";
  const page = parseInt(params.page || "1", 10);
  const limit = parseInt(params.limit || "9", 10);

  const validSort = ["latest","oldest","title","popular"].includes(sort) ? sort as "latest"|"oldest"|"title"|"popular" : "latest";
  const currentPage = isNaN(page) ? 1 : Math.max(1, page);
  const currentLimit = isNaN(limit) ? 9 : Math.min(50, Math.max(1, limit));

  const [{ exams, total, totalPages }, organizations] = await Promise.all([
    getPublishedExams({ q, organization, sort: validSort, page: currentPage, limit: currentLimit }),
    getOrganizations(),
  ]);

  const buildPageUrl = (newPage: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (organization) sp.set("organization", organization);
    if (validSort !== "latest") sp.set("sort", validSort);
    if (newPage !== 1) sp.set("page", String(newPage));
    if (currentLimit !== 9) sp.set("limit", String(currentLimit));
    const qs = sp.toString();
    return `/exams${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Exam Library</h1>
        <Badge variant="secondary">{total} {total===1?"exam":"exams"}{q||organization?" filtered":""}</Badge>
      </div>

      <ExamFilters organizations={organizations} />

      {exams.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No exams found</CardTitle>
            <CardDescription>
              {q || organization ? "Try adjusting filters." : <>Run <code className="rounded bg-muted px-1">npm run seed</code> to generate the SSC mock.</>}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {exams.map((exam) => {
              const sectionCount = exam.currentVersion?.sections.length ?? 0;
              let config: { timing?: { totalSec?: number } } = {};
              try { config = exam.currentVersion?.config ? JSON.parse(exam.currentVersion.config) : {}; } catch {}
              const minutes = config.timing?.totalSec ? Math.round(config.timing.totalSec / 60) : 60;
              const questionCount = exam.currentVersion?.sections.reduce((acc, s) => acc + (s.questions?.length ?? 0), 0) ?? 0;
              return (
                <Card key={exam.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-2 text-base">{exam.title}</CardTitle>
                      {exam.organization && <Badge variant="outline">{exam.organization.name}</Badge>}
                    </div>
                    <CardDescription className="flex items-center gap-2 text-xs">
                      <Building2 className="size-3" /> {exam.slug}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto space-y-3">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="size-4" /> {minutes} min</span>
                      <span className="flex items-center gap-1"><FileText className="size-4" /> {sectionCount} sections</span>
                      {questionCount>0 && <span className="flex items-center gap-1"><FileText className="size-4" /> {questionCount} Qs</span>}
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/exams/${exam.slug}`} className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
                        View
                      </Link>
                      <Link href={`/exam/${exam.slug}`} className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm">
                        Start
                      </Link>
                    </div>
                    <p className="text-xs text-muted-foreground">Created {new Date(exam.createdAt).toLocaleDateString()}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages} • {total} total</p>
              <div className="flex gap-2">
                <Link href={buildPageUrl(currentPage-1)}><Button variant="outline" size="sm" disabled={currentPage<=1} className="gap-1"><ChevronLeft className="size-4"/> Prev</Button></Link>
                <Link href={buildPageUrl(currentPage+1)}><Button variant="outline" size="sm" disabled={currentPage>=totalPages} className="gap-1">Next <ChevronRight className="size-4"/></Button></Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
