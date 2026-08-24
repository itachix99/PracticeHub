"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CheckCircle2,
  Save,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  UploadCloud,
  ExternalLink,
} from "lucide-react";

interface DraftOption {
  label: string;
  text: string;
}
interface DraftQuestion {
  id: string;
  order: number;
  text: string;
  type: string;
  options: DraftOption[];
  correctOptionLabel: string | null;
  explanation: string | null;
  marks: number;
  needsReview: boolean;
  status: string;
}

interface ReviewStudioProps {
  uploadId: string;
  initialDrafts: DraftQuestion[];
  upload: { fileName: string; status: string; examId?: string | null };
}

export function ReviewStudio({
  uploadId,
  initialDrafts,
  upload,
}: ReviewStudioProps) {
  const [drafts, setDrafts] = React.useState<DraftQuestion[]>(initialDrafts);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [filterNeedsReview, setFilterNeedsReview] = React.useState(false);
  const [publishTitle, setPublishTitle] = React.useState(
    upload.fileName.replace(/\\.pdf$/i, "").replace(/[-_]/g, " ")
  );
  const [publishSlug, setPublishSlug] = React.useState("");
  const [publishing, setPublishing] = React.useState(false);
  const [publishedExam, setPublishedExam] = React.useState<{
    slug: string;
    title: string;
  } | null>(null);
  const [uploadStatus, setUploadStatus] = React.useState(upload.status);

  const visibleDrafts = React.useMemo(
    () => (filterNeedsReview ? drafts.filter((d) => d.needsReview) : drafts),
    [drafts, filterNeedsReview]
  );

  const updateLocal = (id: string, patch: Partial<DraftQuestion>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );
  };

  const handleSave = async (draft: DraftQuestion) => {
    setSavingId(draft.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/uploads/${uploadId}/questions/${draft.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: draft.text,
            type: draft.type,
            options: draft.options,
            correctOptionLabel: draft.correctOptionLabel,
            explanation: draft.explanation,
            marks: draft.marks,
            needsReview: draft.needsReview,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSuccess(`Saved Q${draft.order}`);
      if (data.draft) {
        setDrafts((prev) =>
          prev.map((d) =>
            d.id === draft.id
              ? { ...d, ...data.draft, options: data.draft.options }
              : d
          )
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    try {
      const res = await fetch(`/api/uploads/${uploadId}/questions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      setSuccess("Deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleAddOption = (draftId: string) => {
    const draft = drafts.find((d) => d.id === draftId);
    if (!draft) return;
    const nextLabel = String.fromCharCode(65 + draft.options.length);
    if (draft.options.length >= 6) return;
    updateLocal(draftId, {
      options: [...draft.options, { label: nextLabel, text: "" }],
    });
  };

  const handleRemoveOption = (draftId: string, label: string) => {
    const draft = drafts.find((d) => d.id === draftId);
    if (!draft) return;
    const filtered = draft.options.filter((o) => o.label !== label);
    const relabeled = filtered.map((o, idx) => ({
      ...o,
      label: String.fromCharCode(65 + idx),
    }));
    let correct = draft.correctOptionLabel;
    if (correct && !relabeled.some((o) => o.label === correct)) correct = null;
    updateLocal(draftId, { options: relabeled, correctOptionLabel: correct });
  };

  const handleApproveAll = async () => {
    if (
      !confirm(
        `Approve ${drafts.length} questions? This will mark upload as READY.`
      )
    )
      return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/uploads/${uploadId}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approve failed");
      setSuccess(
        `Approved ${data.approved ?? drafts.length} questions - upload READY`
      );
      setDrafts((prev) =>
        prev.map((d) => ({ ...d, status: "APPROVED", needsReview: false }))
      );
      setUploadStatus("READY");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    }
  };

  const handlePublish = async () => {
    setError(null);
    setSuccess(null);
    setPublishing(true);
    try {
      const res = await fetch(`/api/uploads/${uploadId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: publishTitle,
          slug: publishSlug || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");
      setPublishedExam({ slug: data.exam.slug, title: data.exam.title });
      setUploadStatus("PUBLISHED");
      setSuccess(`Published as exam "${data.exam.title}" (${data.exam.slug})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleAddQuestion = () => {
    const newDraft: DraftQuestion = {
      id: `temp-${Date.now()}`,
      order: drafts.length + 1,
      text: "",
      type: "SCQ",
      options: [
        { label: "A", text: "" },
        { label: "B", text: "" },
      ],
      correctOptionLabel: null,
      explanation: null,
      marks: 1,
      needsReview: true,
      status: "DRAFT",
    };
    setDrafts((prev) => [...prev, newDraft]);
  };

  const isReady = uploadStatus === "READY";
  const isPublished = uploadStatus === "PUBLISHED" || !!publishedExam;
  const allApproved =
    drafts.length > 0 && drafts.every((d) => d.status === "APPROVED");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Review Studio - {upload.fileName}</span>
            <Badge
              variant={
                isPublished ? "default" : isReady ? "outline" : "secondary"
              }
            >
              {uploadStatus}
            </Badge>
          </CardTitle>
          <CardDescription>
            {drafts.length} question(s) •{" "}
            {drafts.filter((d) => d.needsReview).length} need review •{" "}
            {drafts.filter((d) => d.status === "APPROVED").length} approved
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            onClick={handleApproveAll}
            disabled={drafts.length === 0 || allApproved}
            className="gap-2"
          >
            <CheckCircle2 className="size-4" /> Approve All & Mark READY
          </Button>
          <Button
            variant="outline"
            onClick={() => setFilterNeedsReview(!filterNeedsReview)}
            className="gap-2"
          >
            {filterNeedsReview ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
            {filterNeedsReview
              ? "Show All"
              : `Filter Needs Review (${drafts.filter((d) => d.needsReview).length})`}
          </Button>
          <Button
            variant="outline"
            onClick={handleAddQuestion}
            className="gap-2"
          >
            <Plus className="size-4" /> Add Question (local)
          </Button>
        </CardContent>
      </Card>

      {(isReady || isPublished) && (
        <Card
          className={
            isPublished ? "border-green-200 bg-green-50/50" : "border-amber-200"
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {isPublished ? (
                <>
                  <CheckCircle2 className="size-5 text-green-600" /> Published
                </>
              ) : (
                <>
                  <UploadCloud className="size-5" /> Publish to Exam Library
                </>
              )}
            </CardTitle>
            <CardDescription>
              {isPublished
                ? "This upload is live as an exam. Students can now attempt it."
                : "Turn approved drafts into a publishable exam. Title and slug can be edited."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isPublished ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Exam Title</Label>
                    <Input
                      value={publishTitle}
                      onChange={(e) => setPublishTitle(e.target.value)}
                      placeholder="e.g. SSC CGL 2024 Tier 1"
                    />
                  </div>
                  <div>
                    <Label>Slug (optional, auto-generated)</Label>
                    <Input
                      value={publishSlug}
                      onChange={(e) => setPublishSlug(e.target.value)}
                      placeholder="ssc-cgl-2024-tier1"
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Lowercase, hyphens only. Leave blank to auto-generate.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handlePublish}
                    disabled={publishing || !isReady}
                    className="gap-2"
                  >
                    <UploadCloud className="size-4" />
                    {publishing ? "Publishing..." : "Publish Exam"}
                  </Button>
                  {!isReady && (
                    <p className="self-center text-xs text-amber-600">
                      Approve all drafts first (READY required)
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                {publishedExam && (
                  <Link href={`/exams/${publishedExam.slug}`}>
                    <Button className="gap-2">
                      <ExternalLink className="size-4" /> View Exam:{" "}
                      {publishedExam.title}
                    </Button>
                  </Link>
                )}
                {!publishedExam && upload.examId && (
                  <Link href={`/exams/${upload.examId}`}>
                    <Button variant="outline" className="gap-2">
                      <ExternalLink className="size-4" /> View Exam
                    </Button>
                  </Link>
                )}
                <Link href="/exams">
                  <Button variant="outline">Go to Exam Library</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="flex items-center gap-1 text-sm text-red-600">
          <AlertCircle className="size-4" />
          {error}
        </p>
      )}
      {success && (
        <p className="flex items-center gap-1 text-sm text-green-600">
          <CheckCircle2 className="size-4" />
          {success}
        </p>
      )}

      {visibleDrafts.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            No questions{filterNeedsReview ? " needing review" : ""}. Try
            adjusting filter or re-upload.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleDrafts.map((draft) => (
            <Card
              key={draft.id}
              className={
                draft.needsReview ? "border-amber-300 bg-amber-50/20" : ""
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>
                    Q{draft.order}{" "}
                    <Badge
                      variant={
                        draft.status === "APPROVED"
                          ? "default"
                          : draft.needsReview
                            ? "destructive"
                            : "outline"
                      }
                      className="ml-2"
                    >
                      {draft.status}
                      {draft.needsReview ? " • needs review" : ""}
                    </Badge>
                  </span>
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateLocal(draft.id, {
                          needsReview: !draft.needsReview,
                        })
                      }
                    >
                      {draft.needsReview ? "Mark Reviewed" : "Flag Review"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(draft.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Question Text</Label>
                  <Textarea
                    value={draft.text}
                    onChange={(e) =>
                      updateLocal(draft.id, { text: e.target.value })
                    }
                    rows={2}
                    placeholder="Enter question stem verbatim"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Type</Label>
                    <select
                      value={draft.type}
                      onChange={(e) =>
                        updateLocal(draft.id, { type: e.target.value })
                      }
                      className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm"
                    >
                      <option value="SCQ">SCQ (single correct)</option>
                      <option value="MCQ">MCQ (multiple)</option>
                      <option value="NUMERIC">NUMERIC</option>
                      <option value="TRUE_FALSE">TRUE_FALSE</option>
                      <option value="PASSAGE">PASSAGE</option>
                    </select>
                  </div>
                  <div>
                    <Label>Marks</Label>
                    <Input
                      type="number"
                      value={draft.marks}
                      onChange={(e) =>
                        updateLocal(draft.id, {
                          marks: parseFloat(e.target.value) || 0,
                        })
                      }
                      min={0}
                      step={0.5}
                    />
                  </div>
                </div>
                <div>
                  <Label>
                    Options{" "}
                    {draft.type !== "NUMERIC" && `(${draft.options.length})`}
                  </Label>
                  {draft.type === "NUMERIC" ? (
                    <p className="text-muted-foreground text-xs">
                      Numeric question - no options needed
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {draft.options.map((opt) => (
                        <div
                          key={opt.label}
                          className="flex items-center gap-2"
                        >
                          <Badge variant="outline">{opt.label}</Badge>
                          <Input
                            value={opt.text}
                            onChange={(e) => {
                              const newOpts = draft.options.map((o) =>
                                o.label === opt.label
                                  ? { ...o, text: e.target.value }
                                  : o
                              );
                              updateLocal(draft.id, { options: newOpts });
                            }}
                            placeholder={`Option ${opt.label}`}
                            className="flex-1"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              handleRemoveOption(draft.id, opt.label)
                            }
                            disabled={draft.options.length <= 2}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddOption(draft.id)}
                          disabled={draft.options.length >= 6}
                        >
                          <Plus className="size-3" /> Add Option
                        </Button>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">Correct:</Label>
                          <select
                            value={draft.correctOptionLabel ?? ""}
                            onChange={(e) =>
                              updateLocal(draft.id, {
                                correctOptionLabel: e.target.value || null,
                              })
                            }
                            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                          >
                            <option value="">-- none (needsReview) --</option>
                            {draft.options.map((o) => (
                              <option key={o.label} value={o.label}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <Label>Explanation (optional)</Label>
                  <Textarea
                    value={draft.explanation ?? ""}
                    onChange={(e) =>
                      updateLocal(draft.id, {
                        explanation: e.target.value || null,
                      })
                    }
                    rows={2}
                    placeholder="Explanation if present in source"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => handleSave(draft)}
                    disabled={savingId === draft.id}
                    className="gap-1"
                  >
                    <Save className="size-4" />
                    {savingId === draft.id ? "Saving..." : "Save"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
