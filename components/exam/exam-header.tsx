"use client";

import { Clock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  title: string;
  remaining: string;
  remainingSec: number;
  warningSec?: number;
}

export function ExamHeader({
  title,
  remaining,
  remainingSec,
  warningSec = 300,
}: Props) {
  const isWarning = remainingSec <= warningSec && remainingSec > 60;
  const isCritical = remainingSec <= 60;
  return (
    <header className="bg-card sticky top-0 z-10 flex h-14 items-center justify-between border-b px-4">
      <h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1>
      <div className="flex items-center gap-3">
        <Badge
          variant={
            isCritical ? "destructive" : isWarning ? "secondary" : "outline"
          }
          className="gap-1.5 py-1.5"
        >
          {isCritical && <AlertTriangle className="size-3.5" />}
          <Clock className="size-3.5" />
          <span className="font-mono text-sm font-bold">{remaining}</span>
        </Badge>
        <span className="text-muted-foreground hidden text-xs sm:inline">
          Time Left
        </span>
      </div>
    </header>
  );
}
