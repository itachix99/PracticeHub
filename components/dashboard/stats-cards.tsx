import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Trophy, Target, FileText, Upload } from "lucide-react";
import type { StudentStats, UploaderStats } from "@/lib/services/analytics.service";

interface Props {
  student: StudentStats;
  uploader: UploaderStats;
  role?: string;
}

export function StatsCards({ student, uploader, role }: Props) {
  const isUploader = role === "UPLOADER" || role === "ADMIN" || role === "MODERATOR";
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Attempts</CardTitle>
          <Target className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{student.totalAttempts}</div>
          <p className="text-xs text-muted-foreground">{student.submittedAttempts} submitted</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
          <Trophy className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{student.avgPercentage !== null ? `${student.avgPercentage}%` : "—"}</div>
          <p className="text-xs text-muted-foreground">{student.bestPercentage !== null ? `Best ${student.bestPercentage}%` : "No submissions"}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Time Spent</CardTitle>
          <Clock className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{Math.round(student.totalTimeMs / 60000)}m</div>
          <p className="text-xs text-muted-foreground">{student.lastAttemptAt ? `Last ${new Date(student.lastAttemptAt).toLocaleDateString()}` : "No activity"}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{isUploader ? "Uploads" : "Exams"}</CardTitle>
          {isUploader ? <Upload className="size-4 text-muted-foreground" /> : <FileText className="size-4 text-muted-foreground" />}
        </CardHeader>
        <CardContent>
          {isUploader ? (
            <>
              <div className="text-2xl font-bold">{uploader.totalUploads}</div>
              <p className="text-xs text-muted-foreground">{uploader.totalPublishedExams} published • {uploader.totalDrafts} drafts</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(uploader.uploadsByStatus).slice(0,4).map(([k,v])=> <Badge key={k} variant="outline" className="text-xs">{k}: {v}</Badge>)}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold">{student.submittedAttempts}</div>
              <p className="text-xs text-muted-foreground">Exams attempted</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
