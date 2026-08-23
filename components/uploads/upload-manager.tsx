"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Upload, FileText, Clock, AlertCircle, CheckCircle2 } from "lucide-react";

interface UploadItem {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  jobs: Array<{ id: string; status: string; createdAt: string }>;
}

export function UploadManager() {
  const [file, setFile] = React.useState<File | null>(null);
  const [source, setSource] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [uploads, setUploads] = React.useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = React.useState(false);

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
        setSuccess(`Uploaded ${file.name} — ${data.paperUpload.status}`);
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
          <CardDescription>PDF only, max 50MB, must start with %PDF, encrypted PDFs rejected. Stored privately until published.</CardDescription>
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
            {file && <p className="mt-2 text-sm font-medium">{file.name} • {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
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
          <CardDescription>Secure object storage • private until published • job statuses</CardDescription>
        </CardHeader>
        <CardContent>
          {uploads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No uploads yet. Upload a PDF to see it here.</p>
          ) : (
            <div className="space-y-3">
              {uploads.map((u) => (
                <div key={u.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{u.fileName}</p>
                    <p className="text-xs text-muted-foreground">{(u.sizeBytes / 1024).toFixed(1)} KB • {u.mimeType} • {new Date(u.createdAt).toLocaleString()}</p>
                    {u.jobs[0] && <p className="mt-1 flex items-center gap-1 text-xs"><Clock className="size-3" />Job {u.jobs[0].status} • {new Date(u.jobs[0].createdAt).toLocaleString()}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={u.status === "UPLOADED" || u.status === "PROCESSING" ? "secondary" : u.status === "FAILED" ? "destructive" : "outline"}>{u.status}</Badge>
                    <Badge variant="outline">{u.id.slice(0, 8)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
