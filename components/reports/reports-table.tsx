"use client";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import Link from "next/link";

interface Report {
  id: string;
  type: string;
  description: string;
  status: string;
  createdAt: string | Date;
  reporter: { id: string; name: string | null; email: string };
  exam: { id: string; title: string; slug: string } | null;
  question: { id: string; text: string } | null;
}

interface Props { reports: Report[] }

export function ReportsTable({ reports: initial }: Props) {
  const [reports, setReports] = React.useState(initial);
  const [updating, setUpdating] = React.useState<string | null>(null);

  const handleStatus = async (id: string, status: "RESOLVED" | "REJECTED") => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setUpdating(null);
    }
  };

  if (reports.length === 0) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No reports in this filter.</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <Card key={r.id} className={r.status==="OPEN" ? "border-amber-200" : ""}>
          <CardContent className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={r.status==="OPEN"?"destructive": r.status==="RESOLVED"?"default":"secondary"}>{r.status}</Badge>
                  <Badge variant="outline">{r.type}</Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="size-3"/>{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm">{r.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reporter: {r.reporter.email} {r.reporter.name ? `(${r.reporter.name})` : ""} • 
                  {r.exam && <>Exam: <Link href={`/exams/${r.exam.slug}`} className="underline">{r.exam.title}</Link> • </>}
                  {r.question && <>Question: {r.question.text.slice(0,80)}... </>}
                  ID: {r.id.slice(0,8)}
                </p>
              </div>
              {r.status==="OPEN" && (
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" onClick={()=>handleStatus(r.id, "RESOLVED")} disabled={updating===r.id} className="gap-1"><CheckCircle2 className="size-4"/>Resolve</Button>
                  <Button size="sm" variant="outline" onClick={()=>handleStatus(r.id, "REJECTED")} disabled={updating===r.id} className="gap-1"><XCircle className="size-4"/>Reject</Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
