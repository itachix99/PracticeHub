import { prisma } from "../db";

export interface StudentStats {
  totalAttempts: number;
  submittedAttempts: number;
  avgPercentage: number | null;
  bestPercentage: number | null;
  bestScore: number | null;
  totalTimeMs: number;
  lastAttemptAt: string | null;
}

export interface RecentAttempt {
  id: string;
  examId: string;
  examTitle: string;
  examSlug: string;
  status: string;
  percentage: number | null;
  score: number | null;
  maxScore: number | null;
  startedAt: string;
  submittedAt: string | null;
  resultId: string | null;
}

export interface UploaderStats {
  totalUploads: number;
  uploadsByStatus: Record<string, number>;
  totalDrafts: number;
  totalPublishedExams: number;
}

export async function getStudentStats(userId: string): Promise<StudentStats> {
  const attempts = await prisma.examAttempt.findMany({
    where: { userId },
    include: { result: true },
    orderBy: { createdAt: "desc" },
  });
  const totalAttempts = attempts.length;
  const submitted = attempts.filter(a => a.status === "SUBMITTED" && a.result);
  const percentages = submitted.map(a => a.result!.percentage).filter(p => typeof p === "number");
  const avgPercentage = percentages.length ? Math.round(percentages.reduce((s,v)=>s+v,0)/percentages.length) : null;
  const bestPercentage = percentages.length ? Math.max(...percentages) : null;
  const bestScore = submitted.length ? Math.max(...submitted.map(a=>a.result!.score)) : null;
  const totalTimeMs = submitted.reduce((s,a)=>s+(a.result?.timeTakenMs ?? 0),0);
  const lastAttemptAt = attempts[0]?.createdAt ? attempts[0].createdAt.toISOString() : null;
  return {
    totalAttempts,
    submittedAttempts: submitted.length,
    avgPercentage,
    bestPercentage,
    bestScore,
    totalTimeMs,
    lastAttemptAt,
  };
}

export async function getRecentAttempts(userId: string, limit = 5): Promise<RecentAttempt[]> {
  const attempts = await prisma.examAttempt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      result: true,
      version: { include: { exam: true } },
    },
  });
  return attempts.map((a) => {
    const exam = (a as unknown as { version: { exam?: { title: string; slug: string } | null } }).version?.exam;
    const fallbackExamId = a.examId;
    return {
      id: a.id,
      examId: a.examId,
      examTitle: exam?.title ?? "Unknown Exam",
      examSlug: exam?.slug ?? fallbackExamId,
      status: a.status,
      percentage: a.result?.percentage ?? null,
      score: a.result?.score ?? null,
      maxScore: a.result?.maxScore ?? null,
      startedAt: a.startedAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
      resultId: a.result?.id ?? null,
    };
  });
}

export async function getUploaderStats(userId: string): Promise<UploaderStats> {
  const uploads = await prisma.paperUpload.findMany({ where: { ownerId: userId } });
  const uploadsByStatus: Record<string, number> = {};
  for (const u of uploads) uploadsByStatus[u.status] = (uploadsByStatus[u.status] ?? 0) + 1;
  const totalDrafts = await prisma.draftQuestion.count({ where: { paperUpload: { ownerId: userId } } });
  const totalPublishedExams = await prisma.exam.count({ where: { ownerId: userId, isPublished: true } });
  return {
    totalUploads: uploads.length,
    uploadsByStatus,
    totalDrafts,
    totalPublishedExams,
  };
}

export async function getDailyAttempts(userId: string, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const attempts = await prisma.examAttempt.findMany({
    where: { userId, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
  });
  // Group by date string YYYY-MM-DD
  const map = new Map<string, number>();
  for (let i=0;i<days;i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days-1-i));
    const key = d.toISOString().slice(0,10);
    map.set(key, 0);
  }
  for (const a of attempts) {
    const key = a.createdAt.toISOString().slice(0,10);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
}
