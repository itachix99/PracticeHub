"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, FileText, AlertCircle } from "lucide-react";

interface Props {
  title: string;
  instructions?: string;
  totalQuestions: number;
  totalMinutes: number;
  sections: Array<{ name: string; count: number }>;
  onStart: () => void;
}

export function InstructionsScreen({
  title,
  instructions,
  totalQuestions,
  totalMinutes,
  sections,
  onStart,
}: Props) {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>
            Read instructions carefully before starting
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1">
              <Clock className="size-3.5" /> {totalMinutes} minutes
            </Badge>
            <Badge variant="outline" className="gap-1">
              <FileText className="size-3.5" /> {totalQuestions} questions
            </Badge>
            <Badge variant="outline">{sections.length} sections</Badge>
          </div>
          <div className="bg-muted rounded-md p-4 text-sm">
            <p className="font-medium">Sections:</p>
            <ul className="list-disc pl-5">
              {sections.map((s) => (
                <li key={s.name}>
                  {s.name} — {s.count} questions
                </li>
              ))}
            </ul>
          </div>
          {instructions && (
            <p className="text-sm leading-relaxed">{instructions}</p>
          )}
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex gap-2 font-medium">
              <AlertCircle className="size-4 shrink-0" />
              Important
            </p>
            <ul className="mt-1 list-disc pl-5">
              <li>
                Timer is authoritative (server `expiresAt` in Phase 5, client
                for Phase 4).
              </li>
              <li>
                Palette shows: Not Visited (gray), Not Answered (red), Answered
                (green), Marked (purple).
              </li>
              <li>
                Use Save & Next to record answer, Mark for Review to flag.
              </li>
            </ul>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              Phase 4: No persistence yet — refresh will reset (Phase 5 adds
              recovery).
            </p>
            <Button onClick={onStart} size="lg">
              Start Exam
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
