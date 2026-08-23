"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, Save, Trash2, Plus, Eye, EyeOff } from "lucide-react";

interface DraftOption { label: string; text: string }
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
  upload: { fileName: string; status: string };
}

export function ReviewStudio({ uploadId, initialDrafts, upload }: ReviewStudioProps) {
  const [drafts, setDrafts] = React.useState<DraftQuestion[]>(initialDrafts);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [filterNeedsReview, setFilterNeedsReview] = React.useState(false);

  const visibleDrafts = React.useMemo(() => filterNeedsReview ? drafts.filter(d => d.needsReview) : drafts, [drafts, filterNeedsReview]);

  const updateLocal = (id: string, patch: Partial<DraftQuestion>) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  };

  const handleSave = async (draft: DraftQuestion) => {
    setSavingId(draft.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/uploads/${uploadId}/questions/${draft.id}`, {
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
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSuccess(`Saved Q${draft.order}`);
      // Update with server response to ensure consistency
      if (data.draft) {
        setDrafts(prev => prev.map(d => d.id === draft.id ? { ...d, ...data.draft, options: data.draft.options } : d));
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
      const res = await fetch(`/api/uploads/${uploadId}/questions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      setDrafts(prev => prev.filter(d => d.id !== id));
      setSuccess("Deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleAddOption = (draftId: string) => {
    const draft = drafts.find(d => d.id === draftId);
    if (!draft) return;
    const nextLabel = String.fromCharCode(65 + draft.options.length); // A, B, C...
    if (draft.options.length >= 6) return;
    updateLocal(draftId, { options: [...draft.options, { label: nextLabel, text: "" }] });
  };

  const handleRemoveOption = (draftId: string, label: string) => {
    const draft = drafts.find(d => d.id === draftId);
    if (!draft) return;
    const filtered = draft.options.filter(o => o.label !== label);
    // Re-label to keep sequential A,B,C
    const relabeled = filtered.map((o, idx) => ({ ...o, label: String.fromCharCode(65+idx) }));
    let correct = draft.correctOptionLabel;
    if (correct && !relabeled.some(o => o.label === correct)) correct = null;
    updateLocal(draftId, { options: relabeled, correctOptionLabel: correct });
  };

  const handleApproveAll = async () => {
    if (!confirm(`Approve ${drafts.length} questions? This will mark upload as READY.`)) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/uploads/${uploadId}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approve failed");
      setSuccess(`Approved ${data.approved ?? drafts.length} questions - upload READY`);
      setDrafts(prev => prev.map(d => ({ ...d, status: "APPROVED", needsReview: false })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    }
  };

  const handleAddQuestion = () => {
    const newDraft: DraftQuestion = {
      id: `temp-${Date.now()}`,
      order: drafts.length + 1,
      text: "",
      type: "SCQ",
      options: [{ label: "A", text: "" }, { label: "B", text: "" }],
      correctOptionLabel: null,
      explanation: null,
      marks: 1,
      needsReview: true,
      status: "DRAFT",
    };
    // For temp, we will POST via bulk? Instead, create via API? For MVP, just add locally and require save to create on server? But temp id not in DB.
    // So we need to create via direct prisma? Instead, we will just push locally and when saved, it will fail because not in DB. So we should create via API call to create draft.
    // For simplicity, add locally and show warning that it needs backend create - we will implement create via POST to questions route (not yet exist). For now, just add locally.
    setDrafts(prev => [...prev, newDraft]);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Review Studio - {upload.fileName}</span>
            <Badge variant={upload.status === "READY" ? "default" : upload.status === "REVIEW_REQUIRED" ? "outline" : "secondary"}>{upload.status}</Badge>
          </CardTitle>
          <CardDescription>
            {drafts.length} question(s) extracted via {drafts.length>0 ? "AI" : "-"} • {drafts.filter(d=>d.needsReview).length} need review • Edit, correct, and approve
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={handleApproveAll} disabled={drafts.length===0 || drafts.every(d=>d.status==="APPROVED")} className="gap-2"><CheckCircle2 className="size-4" /> Approve All & Mark READY</Button>
          <Button variant="outline" onClick={()=>setFilterNeedsReview(!filterNeedsReview)} className="gap-2">{filterNeedsReview ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}{filterNeedsReview ? "Show All" : `Filter Needs Review (${drafts.filter(d=>d.needsReview).length})`}</Button>
          <Button variant="outline" onClick={handleAddQuestion} className="gap-2"><Plus className="size-4"/> Add Question (local)</Button>
        </CardContent>
      </Card>

      {error && <p className="flex items-center gap-1 text-sm text-red-600"><AlertCircle className="size-4"/>{error}</p>}
      {success && <p className="flex items-center gap-1 text-sm text-green-600"><CheckCircle2 className="size-4"/>{success}</p>}

      {visibleDrafts.length===0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No questions{filterNeedsReview ? " needing review" : ""}. Try adjusting filter or re-upload.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {visibleDrafts.map((draft) => (
            <Card key={draft.id} className={draft.needsReview ? "border-amber-300 bg-amber-50/20" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Q{draft.order} <Badge variant={draft.status==="APPROVED"?"default":draft.needsReview?"destructive":"outline"} className="ml-2">{draft.status}{draft.needsReview?" • needs review":""}</Badge></span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={()=>updateLocal(draft.id, { needsReview: !draft.needsReview })}>{draft.needsReview ? "Mark Reviewed" : "Flag Review"}</Button>
                    <Button size="sm" variant="ghost" onClick={()=>handleDelete(draft.id)}><Trash2 className="size-4"/></Button>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Question Text</Label>
                  <Textarea value={draft.text} onChange={e=>updateLocal(draft.id, { text: e.target.value })} rows={2} placeholder="Enter question stem verbatim" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Type</Label>
                    <select value={draft.type} onChange={e=>updateLocal(draft.id, { type: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                      <option value="SCQ">SCQ (single correct)</option>
                      <option value="MCQ">MCQ (multiple)</option>
                      <option value="NUMERIC">NUMERIC</option>
                      <option value="TRUE_FALSE">TRUE_FALSE</option>
                      <option value="PASSAGE">PASSAGE</option>
                    </select>
                  </div>
                  <div>
                    <Label>Marks</Label>
                    <Input type="number" value={draft.marks} onChange={e=>updateLocal(draft.id, { marks: parseFloat(e.target.value) || 0 })} min={0} step={0.5} />
                  </div>
                </div>
                <div>
                  <Label>Options {draft.type!=="NUMERIC" && `(${draft.options.length})`}</Label>
                  {draft.type==="NUMERIC" ? (
                    <p className="text-xs text-muted-foreground">Numeric question - no options needed</p>
                  ) : (
                    <div className="space-y-2">
                      {draft.options.map((opt)=>(
                        <div key={opt.label} className="flex items-center gap-2">
                          <Badge variant="outline">{opt.label}</Badge>
                          <Input value={opt.text} onChange={e=>{
                            const newOpts = draft.options.map(o=> o.label===opt.label ? {...o, text:e.target.value} : o);
                            updateLocal(draft.id, { options: newOpts });
                          }} placeholder={`Option ${opt.label}`} className="flex-1" />
                          <Button size="sm" variant="ghost" onClick={()=>handleRemoveOption(draft.id, opt.label)} disabled={draft.options.length<=2}>×</Button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={()=>handleAddOption(draft.id)} disabled={draft.options.length>=6}><Plus className="size-3"/> Add Option</Button>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">Correct:</Label>
                          <select value={draft.correctOptionLabel ?? ""} onChange={e=>updateLocal(draft.id, { correctOptionLabel: e.target.value || null })} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                            <option value="">-- none (needsReview) --</option>
                            {draft.options.map(o=> <option key={o.label} value={o.label}>{o.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <Label>Explanation (optional)</Label>
                  <Textarea value={draft.explanation ?? ""} onChange={e=>updateLocal(draft.id, { explanation: e.target.value || null })} rows={2} placeholder="Explanation if present in source" />
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={()=>handleSave(draft)} disabled={savingId===draft.id} className="gap-1"><Save className="size-4"/>{savingId===draft.id?"Saving...":"Save"}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
