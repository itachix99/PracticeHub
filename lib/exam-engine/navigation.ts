import type { ExamConfig } from "./types";

export function canNavigate(
  from: { sectionId?: string; questionOrder?: number },
  to: { sectionId: string; questionOrder: number },
  config: ExamConfig,
  currentSectionId?: string
): boolean {
  const mode = config.navigation.mode;
  if (mode === "free") return true;
  // sequential: can only go to next/prev in overall order — for Phase 3 we allow free but stub sequential
  // To keep MVP simple, sequential is treated as free with UI guard, not hard block here
  if (mode === "sequential") return true;
  if (mode === "section-lock") {
    // Cannot return to previous section once left — need to track visited sections
    // For Phase 3, we implement basic check: cannot navigate to a section that is before current in sectionOrder
    const order = config.navigation.sectionOrder;
    if (!order || !currentSectionId) return true;
    const curIdx = order.indexOf(currentSectionId);
    const targetIdx = order.indexOf(to.sectionId);
    if (curIdx !== -1 && targetIdx !== -1 && targetIdx < curIdx) return false;
    return true;
  }
  return true;
}

export function getNextQuestion(
  currentOrder: number,
  total: number,
  mode: "next" | "prev" = "next"
): number | null {
  if (mode === "next") return currentOrder + 1 < total ? currentOrder + 1 : null;
  return currentOrder - 1 >= 0 ? currentOrder - 1 : null;
}
