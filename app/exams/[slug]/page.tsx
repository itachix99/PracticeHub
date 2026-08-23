import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ExamDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const exam = await prisma.exam.findUnique({
    where: { slug },
    include: {
      organization: true,
      currentVersion: {
        include: {
          sections: {
            orderBy: { order: "asc" },
            include: { questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } } },
          },
        },
      },
    },
  });
  if (!exam || !exam.currentVersion) return notFound();
  const config = (() => { try { return JSON.parse(exam.currentVersion.config); } catch { return {}; } })();
  const totalQuestions = exam.currentVersion.sections.reduce((acc, s) => acc + s.questions.length, 0);
  const minutes = config.timing?.totalSec ? Math.round(config.timing.totalSec / 60) : 60;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <Link href="/exams" className="text-sm text-muted-foreground hover:text-foreground">← Back to library</Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{exam.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {exam.organization && <Badge variant="secondary">{exam.organization.name}</Badge>}
          <Badge variant="outline">{exam.slug}</Badge>
          <span className="text-sm text-muted-foreground">{totalQuestions} questions • {minutes} min • {exam.currentVersion.sections.length} sections</span>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
          <CardDescription>Config-driven exam • {config.marking?.default?.marks ?? 1} marks, negative {config.marking?.default?.negative ?? 0}</CardDescription>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <p>This mock is version {exam.currentVersion.version} (immutable). Total time {minutes} minutes. Free navigation. Each question {config.marking?.default?.marks ?? 2} marks, negative {config.marking?.default?.negative ?? 0.5}.</p>
          <p className="text-muted-foreground">Phase 4 will add the CBT simulator. For now you can inspect the structure.</p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {exam.currentVersion.sections.map((sec) => (
          <Card key={sec.id}>
            <CardHeader>
              <CardTitle className="text-base">{sec.name}</CardTitle>
              <CardDescription>{sec.questions.length} questions • Order {sec.order}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sec.questions.slice(0, 3).map((q) => (
                <div key={q.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{q.order + 1}. {q.text}</p>
                  <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
                    {q.options.map((opt) => (
                      <li key={opt.id} className={opt.isCorrect ? "font-semibold text-primary" : ""}>
                        {opt.label}. {opt.text} {opt.isCorrect ? "✓" : ""}
                      </li>
                    ))}
                  </ul>
                  {q.explanation && <p className="mt-2 text-xs text-muted-foreground">Exp: {q.explanation}</p>}
                </div>
              ))}
              {sec.questions.length > 3 && <p className="text-sm text-muted-foreground">+ {sec.questions.length - 3} more questions...</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex gap-3">
        <Button asChild><Link href={`/exam/${exam.slug}`}>Start Exam (Phase 4)</Link></Button>
        <Button variant="outline" asChild><Link href="/exams">Back</Link></Button>
      </div>
    </div>
  );
}
