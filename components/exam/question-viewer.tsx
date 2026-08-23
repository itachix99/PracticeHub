"use client";

import { Card, CardContent } from "@/components/ui/card";

interface Option {
  id: string;
  label: string;
  text: string;
}

interface Props {
  questionNumber: number; // global 1-based
  questionText: string;
  options: Option[];
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
}

export function QuestionViewer({ questionNumber, questionText, options, selectedOptionId, onSelect }: Props) {
  return (
    <Card className="h-full">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex gap-2">
          <span className="font-semibold">Q{questionNumber}.</span>
          <p className="flex-1 text-sm leading-relaxed sm:text-base">{questionText}</p>
        </div>
        <div className="space-y-2">
          {options.map((opt) => {
            const isSelected = selectedOptionId === opt.id;
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card"}`}
              >
                <input
                  type="radio"
                  name={`q-${questionNumber}`}
                  checked={isSelected}
                  onChange={() => onSelect(opt.id)}
                  className="mt-0.5 accent-primary"
                />
                <span className="flex gap-2">
                  <span className="font-medium">({opt.label})</span>
                  <span>{opt.text}</span>
                </span>
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
