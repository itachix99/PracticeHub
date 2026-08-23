"use client";

import { Button } from "@/components/ui/button";

interface Props {
  onPrevious: () => void;
  onClear: () => void;
  onMarkNext: () => void;
  onSaveNext: () => void;
  canPrevious: boolean;
  canNext: boolean;
}

export function ExamControls({ onPrevious, onClear, onMarkNext, onSaveNext, canPrevious, canNext }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-card p-3">
      <div className="flex gap-2">
        <Button variant="outline" onClick={onPrevious} disabled={!canPrevious}>
          Previous
        </Button>
        <Button variant="outline" onClick={onClear}>
          Clear Response
        </Button>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onMarkNext} disabled={!canNext}>
          Mark for Review & Next
        </Button>
        <Button onClick={onSaveNext} disabled={!canNext}>
          Save & Next
        </Button>
      </div>
    </div>
  );
}
