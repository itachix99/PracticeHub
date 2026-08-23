"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Upload, FileText, Clock, AlertCircle, CheckCircle2, Eye, Pencil } from "lucide-react";

interface ExtractionResult {
  id: string;
  raw: string | null;
  structured: string | null;
  warnings: string | null;
  confidence: number | null;
}

interface Job {
  id: string;
  status: string;
  createdAt: string;
  logs: string;
  failedReason?: string | null;
  results?: ExtractionResult[];
}

interface UploadItem {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  jobs: Job[];
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function UploadManager() {
  const [file, setFile] = React.useState<File | null>(null);
  const [source, setSource] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [uploads, setUploads] = React.useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const fetchUploads = React.useCallback(async () => {
    try {
      const res = await fetch("/api/uploads");
      if (res.ok) {
        const data = await res.json();
        setUploads(data.uploads ?? []);
      }
    } catch {}
  }, []);

  React.useEffect(() => { fetchUploads(); }, [fetchUploads]);

  // Poll while any job is PROCESSING or EXTRACTING
  React.useEffect(() => {
    const hasPending = uploads.some((u) => u.jobs[0] && ["PROCESSING","EXTRACTING","OCR_PROCESSING","AI_EXTRACTING","UPLOADED"].includes(u.jobs[0].status));
    if (!hasPending) return;
    const id = setInterval(fetchUploads, 3000);
    return () => clearInterval(id);
  }, [uploads, fetchUploads]);

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setSuccess(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (source) formData.append("source", source);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
      } else {
        setSuccess(`Uploaded ${file.name} - ${data.paperUpload.status} (extracting...)`);
        setFile(null);
        fetchUploads();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="size-5" /> Upload PDF</CardTitle>
          <CardDescription>PDF only, max 50MB, must start with %PDF, encrypted PDFs rejected. Text extraction + OCR fallback runs automatically (Phase 8-9). Configure Azure DI via env for best results.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-6 text-center ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
          >
            <FileText className="mb-2 size-8 text-muted-foreground" />
            <p className="text-sm">Drag & drop PDF here or click to choose</p>
            <Input type="file" accept=".pdf,application/pdf" className="mt-2 max-w-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
            {file && <p className="mt-2 text-sm font-medium">{file.name} \u2022 {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Source / Attribution (optional)</label>
            <Input placeholder="e.g., SSC CGL 2024 Shift 1 - Official" value={source} onChange={(e) => setSource(e.target.value)} className="mt-1" />
            <p className="mt-1 text-xs text-muted-foreground">Helps with copyright/takedown.</p>
          </div>
          {error && <p className="flex items-center gap-1 text-sm text-red-600"><AlertCircle className="size-4" />{error}</p>}
          {success && <p className="flex items-center gap-1 text-sm text-green-600"><CheckCircle2 className="size-4" />{success}</p>}
          <Button onClick={handleUpload} disabled={!file || uploading} className="w-full sm:w-auto">{uploading ? "Uploading..." : "Upload"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Uploads</CardTitle>
          <CardDescription>Private until published \u2022 extraction preserves per-page text & dimensions</CardDescription>
        </CardHeader>
        <CardContent>
          {uploads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No uploads yet. Upload a PDF to see it here.</p>
          ) : (
            <div className="space-y-3">
              {uploads.map((u) => {
                const job = u.jobs[0];
                const extraction = job?.results?.[0];
                const raw = parseJson<{ totalPages:number; avgCharsPerPage:number; textCoverage:number; needsOcr:boolean; ocrProvider?:string; ocrApplied?:boolean; aiProvider?:string; questionCount?:number; aiNeedsReview?:boolean; pages:Array<{pageNumber:number; charCount:number; hasText:boolean}> } | null>(extraction?.raw ?? null, null);
                const structured = parseJson<{ totalPages:number; fullText:string; pages:Array<{pageNumber:number; text:string}>; questions?: Array<{text:string; type:string; options:Array<{label:string;text:string}>; correctOptionLabel?:string}>; questionCount?:number; aiProvider?:string; aiNeedsReview?:boolean } | null>(extraction?.structured ?? null, null);
                const warnings = parseJson<string[]>(extraction?.warnings ?? null, []);
                const logs = parseJson<Array<{ts:string; level:string; msg:string}>>(job?.logs ?? null, []);
                const isExpanded = expanded === u.id;
                return (
                <div key={u.id} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.fileName}</p>
                      <p className="text-xs text-muted-foreground">{(u.sizeBytes / 1024).toFixed(1)} KB \u2022 {u.mimeType} \u2022 {new Date(u.createdAt).toLocaleString()}</p>
                      {job && <p className="mt-1 flex items-center gap-1 text-xs"><Clock className="size-3" />Job {job.status}{job.failedReason ? ` - ${job.failedReason}` : ""} \u2022 {new Date(job.createdAt).toLocaleString()}</p>}
                      {extraction && raw && (
                        <p className="mt-1 text-xs">
                          <span className="font-medium">{raw.totalPages} page(s)</span> \u2022 {raw.avgCharsPerPage} avg chars/page \u2022 coverage {(raw.textCoverage*100).toFixed(0)}% {raw.needsOcr && <span className="text-amber-600">(needs review - low coverage)</span>}
                          {raw.ocrApplied && <span className="text-green-600"> OCR via {raw.ocrProvider}</span>}
                          {raw.questionCount != null && <span> \u2022 {raw.questionCount} Qs via {raw.aiProvider}{raw.aiNeedsReview ? " (needs review)" : ""}</span>}
                          {extraction.confidence != null && <span> \u2022 conf {(extraction.confidence*100).toFixed(0)}%</span>}
                        </p>
                      )}
                      {warnings.length > 0 && <p className="text-xs text-amber-600">{warnings.join(", ")}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={u.status === "UPLOADED" || u.status === "PROCESSING" || u.status === "EXTRACTING" || u.status === "OCR_PROCESSING" || u.status === "AI_EXTRACTING" ? "secondary" : u.status === "FAILED" ? "destructive" : u.status === "REVIEW_REQUIRED" ? "outline" : "default"}>{u.status}</Badge>
                      <Badge variant="outline">{u.id.slice(0, 8)}</Badge>
                      {raw?.questionCount != null && raw.questionCount>0 && <Link href={`/dashboard/uploads/${u.id}/review`}><Button size="sm" variant="default" className="gap-1"><Pencil className="size-3"/>Review ({raw.questionCount})</Button></Link>}
                      <Button size="sm" variant="ghost" onClick={() => setExpanded(isExpanded ? null : u.id)}><Eye className="size-4" />{isExpanded ? "Hide" : "Details"}</Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-2 space-y-3 border-t pt-3">
                      {logs.length > 0 && (
                        <div>
                          <p className="text-xs font-medium">Logs</p>
                          <div className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-xs font-mono">
                            {logs.map((l, i) => <div key={i} className={l.level==="error" ? "text-red-600" : l.level==="warn" ? "text-amber-600" : ""}>[{new Date(l.ts).toLocaleTimeString()}] {l.level}: {l.msg}</div>)}
                          </div>
                        </div>
                      )}
                      {structured?.questions && structured.questions.length > 0 && (
                        <div>
                          <p className="text-xs font-medium">Extracted questions ({structured.questions.length} via {structured.aiProvider}{structured.aiNeedsReview ? " - needs review": ""})</p>
                          <div className="mt-1 max-h-60 overflow-auto space-y-2 rounded bg-muted p-2">
                            {structured.questions.slice(0,5).map((q, idx)=>(
                              <div key={idx} className="rounded bg-background p-2 text-xs">
                                <p className="font-medium">{idx+1}. {q.text}</p>
                                {q.options.length>0 && <p className="mt-1 text-muted-foreground">{q.options.map(o=> `${o.label}) ${o.text}`).join("  ")}</p>}
                                {q.correctOptionLabel && <p className="text-green-600">Ans: {q.correctOptionLabel} (from source)</p>}
                              </div>
                            ))}
                            {structured.questions.length>5 && <p className="text-xs text-muted-foreground">+{structured.questions.length-5} more...</p>}
                          </div>
                        </div>
                      )}
                      {structured?.fullText && (
                        <div>
                          <p className="text-xs font-medium">Extracted text preview (first 800 chars)</p>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{structured.fullText.slice(0, 800)}{structured.fullText.length > 800 ? "..." : ""}</pre>
                          <p className="text-xs text-muted-foreground mt-1">{structured.pages?.length ?? 0} pages preserved with dimensions</p>
                        </div>
                      )}
                      {!structured?.fullText && job?.status === "EXTRACTING" && (
                        <p className="text-xs text-muted-foreground">Extracting... (polling every 3s)</p>
                      )}
                    </div>
                  )}
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
