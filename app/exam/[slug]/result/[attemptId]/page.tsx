import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ResultPage({ params }: { params: Promise<{ slug: string; attemptId: string }> }) {
  const { slug, attemptId } = await params;
  const session = await auth();
  const userId = (session?.user as unknown as { id?: string })?.id ?? null;

  const exam = await prisma.exam.findUnique({ where: { slug } });
  if (!exam) return notFound();

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      result: true,
      answers: { include: { question: { include: { options: true, answer: true } } } },
      version: { include: { sections: { include: { questions: { include: { options: true, answer: true } } } } } },
    },
  });
  if (!attempt || attempt.examId !== exam.id) return notFound();
  // AuthZ: if attempt has userId, must match
  if (attempt.userId && attempt.userId !== userId) return notFound();
  if (!attempt.result) {
    // Not yet submitted? Redirect to exam
    redirect(`/exam/${slug}`);
  }
  const result = attempt.result;
  let sectionWise: Array<{ sectionId: string; score: number; max: number; attempted: number; correct: number; accuracy: number }> = [];
  try { sectionWise = JSON.parse(result.sectionWise); } catch {}
  const sectionMap = new Map<string, string>();
  for (const sec of attempt.version.sections) sectionMap.set(sec.id, sec.name);

  // Build question map for review
  const questionById = new Map<string, { text: string; options: Array<{ id: string; label: string; text: string }>; correctOptionId: string | null; explanation?: string | null; marks: number; negativeMarks: number; sectionId: string; sectionName: string }>();
  for (const sec of attempt.version.sections) {
    for (const q of sec.questions) {
      questionById.set(q.id, {
        text: q.text,
        options: q.options.map((o) => ({ id: o.id, label: o.label, text: o.text })),
        correctOptionId: q.answer?.correctOptionId ?? null,
        explanation: q.answer?.explanation ?? q.explanation,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        sectionId: sec.id,
        sectionName: sec.name,
      });
    }
  }

  const timeTakenMin = Math.round(result.timeTakenMs / 60000);
  const timeTakenSec = Math.round((result.timeTakenMs % 60000) / 1000);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{exam.title} — Result</h1>
          <p className="text-sm text-muted-foreground">Attempt {attempt.id.slice(0, 8)} • {new Date(attempt.submittedAt ?? attempt.createdAt).toLocaleString()} • {attempt.status}</p>
        </div>
        <Badge variant={result.percentage >= 50 ? "default" : "secondary"}>{result.percentage.toFixed(1)}%</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Score</CardDescription><CardTitle className="text-2xl">{result.score} / {result.maxScore}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">{result.percentage.toFixed(1)}%</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Attempted</CardDescription><CardTitle className="text-2xl">{result.attempted} / {result.attempted + result.unattempted}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Unattempted {result.unattempted}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Correct / Incorrect</CardDescription><CardTitle className="flex gap-2 text-2xl"><span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="size-5" />{result.correct}</span> <span className="flex items-center gap-1 text-red-600"><XCircle className="size-5" />{result.incorrect}</span></CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Negative {result.negative}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Time Taken</CardDescription><CardTitle className="flex items-center gap-1 text-2xl"><Clock className="size-5" /> {timeTakenMin}m {timeTakenSec}s</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Started {new Date(attempt.startedAt).toLocaleTimeString()}</CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Section Performance</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {sectionWise.map((s) => (
              <div key={s.sectionId} className="rounded-md border p-3">
                <p className="text-sm font-medium">{sectionMap.get(s.sectionId) ?? s.sectionId}</p>
                <p className="text-xs text-muted-foreground">{s.score} / {s.max} • {s.attempted} attempted • {s.correct} correct</p>
                <p className="text-xs font-medium">{s.accuracy.toFixed(1)}% accuracy</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Question Review</CardTitle><CardDescription>Your response vs correct answer • marks earned/lost</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {attempt.answers
            .sort((a, b) => {
              // Sort by global question order: find in version
              const orderA = (() => { for (const sec of attempt.version.sections) { const idx = sec.questions.findIndex((q) => q.id === a.questionId); if (idx !== -1) return sec.order * 100 + idx; } return 999; })();
              const orderB = (() => { for (const sec of attempt.version.sections) { const idx = sec.questions.findIndex((q) => q.id === b.questionId); if (idx !== -1) return sec.order * 100 + idx; } return 999; })();
              return orderA - orderB;
            })
            .map((ans) => {
              const q = questionById.get(ans.questionId);
              if (!q) return null;
              const isCorrect = ans.selectedOptionId && ans.selectedOptionId === q.correctOptionId;
              const isAttempted = !!ans.selectedOptionId;
              const marksEarned = !isAttempted ? 0 : isCorrect ? q.marks : -q.negativeMarks;
              const yourOpt = q.options.find((o) => o.id === ans.selectedOptionId);
              const correctOpt = q.options.find((o) => o.id === q.correctOptionId);
              return (
                <div key={ans.questionId} className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex-1 text-sm font-medium">{q.text}</p>
                    <Badge variant={isAttempted ? (isCorrect ? "default" : "destructive") : "outline"} className="shrink-0">{isAttempted ? (isCorrect ? "Correct" : "Incorrect") : "Skipped"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{q.sectionName} • {q.marks} marks, negative {q.negativeMarks} • {ans.state} • {marksEarned > 0 ? `+${marksEarned}` : marksEarned} earned</p>
                  <div className="mt-3 grid gap-2">
                    {q.options.map((opt) => {
                      const isSelected = opt.id === ans.selectedOptionId;
                      const isCorrectOpt = opt.id === q.correctOptionId;
                      return (
                        <div key={opt.id} className={`flex gap-2 rounded-md border p-2 text-sm ${isCorrectOpt ? "border-green-600 bg-green-50" : ""} ${isSelected && !isCorrectOpt ? "border-red-600 bg-red-50" : ""} ${isSelected ? "ring-1" : ""}`}>
                          <span className="font-medium">({opt.label})</span>
                          <span className="flex-1">{opt.text}</span>
                          {isSelected && <Badge variant="secondary" className="shrink-0">Your</Badge>}
                          {isCorrectOpt && <Badge className="shrink-0 bg-green-600">Correct</Badge>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 grid gap-1 text-xs">
                    <p><span className="text-muted-foreground">Your:</span> {yourOpt ? `${yourOpt.label}. ${yourOpt.text}` : "Not attempted"}</p>
                    <p><span className="text-muted-foreground">Correct:</span> {correctOpt ? `${correctOpt.label}. ${correctOpt.text}` : "—"}</p>
                    {q.explanation && <p className="mt-1 rounded bg-muted p-2"><span className="font-medium">Explanation:</span> {q.explanation}</p>}
                    <p className="text-muted-foreground">Time spent: {ans.timeSpentMs} ms</p>
                  </div>
                </div>
              );
            })}
        </CardContent>
      </Card>

      <div className="mt-6 flex gap-2">
        <Button asChild><Link href={`/exam/${slug}`}>Retake</Link></Button>
        <Button variant="outline" asChild><Link href="/exams">Library</Link></Button>
        <Button variant="outline" asChild><Link href="/dashboard">Dashboard</Link></Button>
      </div>
    </div>
  );
}
