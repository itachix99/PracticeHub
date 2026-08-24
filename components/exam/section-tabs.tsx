"use client";

import { cn } from "@/lib/utils";

interface Section {
  id: string;
  name: string;
  order: number;
}

interface Props {
  sections: Section[];
  activeId: string;
  onChange: (id: string) => void;
}

export function SectionTabs({ sections, activeId, onChange }: Props) {
  return (
    <div className="bg-muted/30 flex gap-1 overflow-x-auto border-b p-1">
      {sections.map((sec) => (
        <button
          key={sec.id}
          onClick={() => onChange(sec.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
            activeId === sec.id
              ? "bg-primary text-primary-foreground shadow"
              : "hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {sec.name}
        </button>
      ))}
    </div>
  );
}
