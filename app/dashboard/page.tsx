import { requireAuth } from "@/lib/auth/guards";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getStudentStats, getRecentAttempts, getUploaderStats, getDailyAttempts } from "@/lib/services/analytics.service";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentAttempts } from "@/components/dashboard/recent-attempts";
import { DailyChart } from "@/components/dashboard/daily-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireAuth();
  const user = session.user as unknown as { id: string; email?: string; name?: string; role?: string };
  const userId = user.id;
  const [student, recent, uploader, daily] = await Promise.all([
    getStudentStats(userId),
    getRecentAttempts(userId, 5),
    getUploaderStats(userId),
    getDailyAttempts(userId, 7),
  ]);

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Welcome, {user.name || user.email} • Role: <Badge variant="secondary">{user.role || "STUDENT"}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/exams"><Button>Browse Exams</Button></Link>
          <Link href="/dashboard/uploads"><Button variant="outline">Uploads</Button></Link>
        </div>
      </div>

      <StatsCards student={student} uploader={uploader} role={user.role} />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentAttempts attempts={recent} />
        </div>
        <div className="space-y-6">
          <DailyChart daily={daily} />
          <Card>
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
              <CardDescription>Navigate to key areas</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Link href="/exams"><Button variant="outline" className="w-full justify-start">Exam Library</Button></Link>
              <Link href="/dashboard/uploads"><Button variant="outline" className="w-full justify-start">My Uploads</Button></Link>
              {uploader.totalUploads>0 && <Link href="/dashboard/uploads"><Button variant="outline" className="w-full justify-start">Review Queue ({uploader.uploadsByStatus["REVIEW_REQUIRED"] ?? 0})</Button></Link>}
            </CardContent>
          </Card>
        </div>
      </div>

      {(uploader.totalUploads>0 || student.totalAttempts>0) ? null : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>No activity yet. Try these steps:</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>• Upload a previous-year paper PDF at <Link href="/dashboard/uploads" className="underline">Uploads</Link> → it will be extracted, OCRed, and AI-parsed.</p>
            <p>• Review & publish it, then appears in <Link href="/exams" className="underline">Exam Library</Link>.</p>
            <p>• Start an exam from the library to generate your first attempt and see analytics here.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
