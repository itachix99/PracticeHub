import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Trophy, Target, FileText, Upload } from "lucide-react";
import type {
  StudentStats,
  UploaderStats,
} from "@/lib/services/analytics.service";

interface Props {
  student: StudentStats;
  uploader: UploaderStats;
  role?: string;
}

export function StatsCards({ student, uploader, role }: Props) {
  const isUploader =
    role === "UPLOADER" || role === "ADMIN" || role === "MODERATOR";
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Attempts</CardTitle>
          <Target className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{student.totalAttempts}</div>
          <p className="text-muted-foreground text-xs">
            {student.submittedAttempts} submitted
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
          <Trophy className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {student.avgPercentage !== null ? `${student.avgPercentage}%` : "—"}
          </div>
          <p className="text-muted-foreground text-xs">
            {student.bestPercentage !== null
              ? `Best ${student.bestPercentage}%`
              : "No submissions"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Time Spent</CardTitle>
          <Clock className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {Math.round(student.totalTimeMs / 60000)}m
          </div>
          <p className="text-muted-foreground text-xs">
            {student.lastAttemptAt
              ? `Last ${new Date(student.lastAttemptAt).toLocaleDateString()}`
              : "No activity"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {isUploader ? "Uploads" : "Exams"}
          </CardTitle>
          {isUploader ? (
            <Upload className="text-muted-foreground size-4" />
          ) : (
            <FileText className="text-muted-foreground size-4" />
          )}
        </CardHeader>
        <CardContent>
          {isUploader ? (
            <>
              <div className="text-2xl font-bold">{uploader.totalUploads}</div>
              <p className="text-muted-foreground text-xs">
                {uploader.totalPublishedExams} published •{" "}
                {uploader.totalDrafts} drafts
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(uploader.uploadsByStatus)
                  .slice(0, 4)
                  .map(([k, v]) => (
                    <Badge key={k} variant="outline" className="text-xs">
                      {k}: {v}
                    </Badge>
                  ))}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold">
                {student.submittedAttempts}
              </div>
              <p className="text-muted-foreground text-xs">Exams attempted</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
