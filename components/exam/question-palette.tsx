"use client";

import { cn } from "@/lib/utils";
import type { QuestionState } from "@/lib/exam-engine/types";

interface PaletteItem {
  id: string;
  number: number; // global 1-based
  state: QuestionState;
}

interface Props {
  items: PaletteItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

const stateStyles: Record<QuestionState, string> = {
  NOT_VISITED: "border bg-muted text-muted-foreground",
  NOT_ANSWERED: "bg-red-500 text-white border-red-600",
  ANSWERED: "bg-green-600 text-white border-green-700",
  MARKED: "bg-purple-500 text-white border-purple-600 ring-2 ring-purple-300",
  ANSWERED_MARKED: "bg-purple-700 text-white border-purple-800 ring-2 ring-purple-300 relative after:content-['✓'] after:absolute after:-right-1 after:-top-1 after:text-[10px] after:bg-green-500 after:rounded-full after:size-3 after:flex after:items-center after:justify-center",
};

const stateIcon: Record<QuestionState, string> = {
  NOT_VISITED: "□",
  NOT_ANSWERED: "○",
  ANSWERED: "●",
  MARKED: "☆",
  ANSWERED_MARKED: "★",
};

export function QuestionPalette({ items, activeId, onSelect }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Question Palette</h3>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => onSelect(it.id)}
            aria-label={`Question ${it.number} - ${it.state}`}
            className={cn(
              "relative flex h-9 w-full items-center justify-center rounded-md border text-sm font-medium transition-all",
              stateStyles[it.state],
              activeId === it.id && "ring-2 ring-primary ring-offset-2"
            )}
          >
            <span>{String(it.number).padStart(2, "0")}</span>
            <span className="absolute bottom-0 right-0.5 text-[8px] leading-none" aria-hidden>
              {stateIcon[it.state]}
            </span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1 text-[11px] leading-tight">
        <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-red-500" /> Not Answered</span>
        <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-green-600" /> Answered</span>
        <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-purple-500" /> Marked</span>
        <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-purple-700" /> Answered & Marked</span>
        <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-muted border" /> Not Visited</span>
      </div>
      <p className="text-xs text-muted-foreground">Icons + colors ensure not color-only.</p>
    </div>
  );
}
