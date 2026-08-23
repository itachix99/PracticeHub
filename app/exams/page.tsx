import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Clock, FileText, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const exams = await prisma.exam.findMany({
    where: { isPublished: true, visibility: "PUBLIC" },
    include: { organization: true, currentVersion: { include: { sections: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (exams.length === 0) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Exam Library</h1>
          <Badge variant="secondary">0 exams</Badge>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No exams yet</CardTitle>
            <CardDescription>Run <code className="rounded bg-muted px-1">npm run seed</code> to generate the SSC mock.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Exam Library</h1>
        <Badge variant="secondary">{exams.length} published</Badge>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {exams.map((exam) => {
          const sectionCount = exam.currentVersion?.sections.length ?? 0;
          let config: { timing?: { totalSec?: number } } = {};
          try { config = exam.currentVersion?.config ? JSON.parse(exam.currentVersion.config) : {}; } catch {}
          const minutes = config.timing?.totalSec ? Math.round(config.timing.totalSec / 60) : 60;
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
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="size-4" /> {minutes} min</span>
                  <span className="flex items-center gap-1"><FileText className="size-4" /> {sectionCount} sections</span>
                </div>
                <div className="flex gap-2">
                  <Link href={`/exams/${exam.slug}`} className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
                    View
                  </Link>
                  <Link href={`/exam/${exam.slug}`} className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm">
                    Start (Phase 4)
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
