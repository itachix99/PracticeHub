import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { ReviewStudio } from "@/components/review/review-studio";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ id: string }> }

export default async function ReviewPage({ params }: Props) {
  const session = await requireAuth();
  const userId = (session.user as unknown as { id: string }).id;
  const { id } = await params;
  const upload = await prisma.paperUpload.findUnique({
    where: { id },
    include: { draftQuestions: { orderBy: { order: "asc" } }, jobs: { orderBy: { createdAt: "desc" }, include: { results: true } } },
  });
  if (!upload) notFound();
  if (upload.ownerId !== userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== "ADMIN" && user.role !== "MODERATOR")) {
      redirect("/dashboard/uploads");
    }
  }
  // If no drafts but has extraction, hydrate
  let drafts = upload.draftQuestions;
  if (drafts.length === 0) {
    const job = upload.jobs[0];
    const result = job?.results[0];
    if (result?.structured) {
      try {
        const structured = JSON.parse(result.structured) as { questions?: Array<{ text: string; type: string; options: Array<{label:string;text:string}>; correctOptionLabel?: string; explanation?: string; marks?: number }> };
        const qs = structured.questions ?? [];
        if (qs.length > 0) {
          // Create drafts on server if missing (for existing uploads before Phase 11)
          const raw = result.raw ? JSON.parse(result.raw) as { aiNeedsReview?: boolean } : {};
          for (let i=0;i<qs.length;i++) {
            const q = qs[i]!;
            await prisma.draftQuestion.create({
              data: {
                paperUploadId: id,
                order: i+1,
                text: q.text.slice(0,4000),
                type: (["SCQ","MCQ","NUMERIC","TRUE_FALSE","PASSAGE","IMAGE_BASED"] as const).includes(q.type as never) ? q.type as never : "SCQ",
                options: JSON.stringify(q.options ?? []),
                correctOptionLabel: q.correctOptionLabel ?? null,
                explanation: q.explanation ?? null,
                marks: typeof q.marks === "number" ? q.marks : 1,
                needsReview: !!raw.aiNeedsReview || (q.options.length === 0 && q.type !== "NUMERIC"),
                status: "DRAFT",
              }
            });
          }
          drafts = await prisma.draftQuestion.findMany({ where: { paperUploadId: id }, orderBy: { order: "asc" } });
        }
      } catch {}
    }
  }

  const initialDrafts = drafts.map(d => ({
    id: d.id,
    order: d.order,
    text: d.text,
    type: d.type,
    options: JSON.parse(d.options) as Array<{label:string;text:string}>,
    correctOptionLabel: d.correctOptionLabel,
    explanation: d.explanation,
    marks: d.marks,
    needsReview: d.needsReview,
    status: d.status,
  }));

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Studio</h1>
          <p className="text-sm text-muted-foreground">Upload {upload.fileName} • {upload.status} • {initialDrafts.length} drafts</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">Phase 11</Badge>
          <Link href="/dashboard/uploads"><Button variant="outline" size="sm">Back to Uploads</Button></Link>
        </div>
      </div>
      {initialDrafts.length === 0 ? (
        <div className="rounded-md border p-8 text-center">
          <p className="text-sm text-muted-foreground">No draft questions found. Ensure extraction completed (REVIEW_REQUIRED) and has questions.</p>
          <p className="mt-2 text-xs text-muted-foreground">Job status: {upload.jobs[0]?.status ?? "unknown"} • Try re-upload or check logs.</p>
        </div>
      ) : (
        <ReviewStudio uploadId={id} initialDrafts={initialDrafts} upload={{ fileName: upload.fileName, status: upload.status, examId: upload.examId }} />
      )}
    </div>
  );
}
