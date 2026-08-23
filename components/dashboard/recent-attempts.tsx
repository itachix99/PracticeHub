import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RecentAttempt } from "@/lib/services/analytics.service";
import { Clock, Trophy } from "lucide-react";

interface Props { attempts: RecentAttempt[] }

export function RecentAttempts({ attempts }: Props) {
  if (attempts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Attempts</CardTitle>
          <CardDescription>No attempts yet. Start an exam from the library.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/exams"><Button>Browse Exams</Button></Link>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Attempts</CardTitle>
        <CardDescription>Last {attempts.length} attempts • Click to view result</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {attempts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{a.examTitle}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="flex items-center gap-1"><Clock className="size-3"/>{new Date(a.startedAt).toLocaleDateString()} {new Date(a.startedAt).toLocaleTimeString()}</span>
                  <Badge variant={a.status==="SUBMITTED"?"default": a.status==="IN_PROGRESS"?"secondary":"outline"} className="text-xs">{a.status}</Badge>
                  {a.percentage !== null && <span className="flex items-center gap-1"><Trophy className="size-3"/>{a.percentage}% ({a.score}/{a.maxScore})</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/exam/${a.examSlug}`}><Button size="sm" variant="outline">Retake</Button></Link>
                {a.resultId && <Link href={`/exam/${a.examSlug}/result/${a.id}`}><Button size="sm">Result</Button></Link>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
