import type { ExamConfig } from "./types";

/**
 * Navigation guards — enforces mode:
 * - free: anywhere
 * - sequential: only adjacent question in global order (requires from.questionOrder)
 * - section-lock: cannot return to a section earlier than currentSectionId in sectionOrder
 */
export function canNavigate(
  from: { sectionId?: string; questionOrder?: number; globalOrder?: number },
  to: { sectionId: string; questionOrder: number; globalOrder?: number },
  config: ExamConfig,
  currentSectionId?: string
): boolean {
  const mode = config.navigation.mode;
  if (mode === "free") return true;
  if (mode === "sequential") {
    // If globalOrder provided, only allow +/-1
    if (from.globalOrder != null && to.globalOrder != null) {
      const diff = Math.abs(to.globalOrder - from.globalOrder);
      return diff === 1 || diff === 0;
    }
    // Fallback: allow navigation within same section only to adjacent order
    if (
      from.sectionId &&
      from.sectionId === to.sectionId &&
      from.questionOrder != null
    ) {
      return Math.abs(to.questionOrder - from.questionOrder) <= 1;
    }
    // Without order info, be permissive but log: treat as free for backward compat
    return true;
  }
  if (mode === "section-lock") {
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
  if (mode === "next")
    return currentOrder + 1 < total ? currentOrder + 1 : null;
  return currentOrder - 1 >= 0 ? currentOrder - 1 : null;
}

export function getGlobalOrder(
  sectionOrder: string[],
  sectionId: string,
  questionOrder: number,
  questionsPerSection: Record<string, number>
): number {
  let offset = 0;
  for (const sid of sectionOrder) {
    if (sid === sectionId) return offset + questionOrder;
    offset += questionsPerSection[sid] ?? 0;
  }
  return questionOrder;
}
