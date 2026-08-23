"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Flag, X, CheckCircle2 } from "lucide-react";

const REPORT_TYPES = [
  { value: "WRONG_QUESTION", label: "Wrong Question" },
  { value: "WRONG_ANSWER", label: "Wrong Answer" },
  { value: "BROKEN_IMAGE", label: "Broken Image" },
  { value: "FORMATTING", label: "Formatting" },
  { value: "DUPLICATE", label: "Duplicate" },
  { value: "WRONG_EXPLANATION", label: "Wrong Explanation" },
  { value: "OTHER", label: "Other" },
];

interface Props {
  examId?: string;
  questionId?: string;
  triggerLabel?: string;
  defaultOpen?: boolean;
  onSuccess?: () => void;
}

export function ReportDialog({ examId, questionId, triggerLabel = "Report", onSuccess }: Props) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState("WRONG_QUESTION");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (description.trim().length < 10) {
      setError("Description must be at least 10 characters");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, questionId, type, description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit report");
      setSuccess(true);
      setDescription("");
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        onSuccess?.();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1">
        <Flag className="size-4" /> {triggerLabel}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !submitting && setOpen(false)}>
      <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Report Issue <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="size-4"/></Button>
          </CardTitle>
          <CardDescription>Help improve exam quality. Moderators will review.</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="flex flex-col items-center gap-2 py-6 text-green-600">
              <CheckCircle2 className="size-8"/>
              <p className="text-sm font-medium">Report submitted - thank you!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="type">Issue Type</Label>
                <select id="type" value={type} onChange={e=>setType(e.target.value)} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {REPORT_TYPES.map(t=> <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={description} onChange={e=>setDescription(e.target.value)} rows={4} placeholder="Describe the issue in detail (min 10 chars)…" required minLength={10} maxLength={2000} />
                <p className="mt-1 text-xs text-muted-foreground">{description.length}/2000</p>
              </div>
              {(examId || questionId) && (
                <p className="text-xs text-muted-foreground">
                  Reporting: {examId ? `Exam ${examId.slice(0,8)}` : ""} {questionId ? `• Question ${questionId.slice(0,8)}` : ""}
                </p>
              )}
              {error && <p className="flex items-center gap-1 text-sm text-red-600"><AlertCircle className="size-4"/>{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={()=>setOpen(false)} disabled={submitting}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting?"Submitting...":"Submit Report"}</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
