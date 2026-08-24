import type { QuestionState } from "./types";

export type PaletteAction = "visit" | "answer" | "clear" | "mark" | "unmark";

/**
 * Pure state transition for attempt answers.
 * Mirrors CBT palette: NOT_VISITED -> NOT_ANSWERED -> ANSWERED -> etc.
 */
export function nextQuestionState(
  current: QuestionState,
  action: PaletteAction,
  hasAnswer: boolean
): QuestionState {
  switch (action) {
    case "visit":
      if (current === "NOT_VISITED")
        return hasAnswer ? "ANSWERED" : "NOT_ANSWERED";
      return current;
    case "answer":
      if (current === "MARKED" || current === "ANSWERED_MARKED")
        return "ANSWERED_MARKED";
      return "ANSWERED";
    case "clear":
      if (current === "ANSWERED_MARKED" || current === "MARKED")
        return "MARKED";
      return "NOT_ANSWERED";
    case "mark":
      if (current === "ANSWERED" || current === "ANSWERED_MARKED" || hasAnswer)
        return "ANSWERED_MARKED";
      return "MARKED";
    case "unmark":
      return hasAnswer ? "ANSWERED" : "NOT_ANSWERED";
    default:
      return current;
  }
}

export const stateMeta: Record<
  QuestionState,
  { label: string; icon: string; color: string }
> = {
  NOT_VISITED: { label: "Not Visited", icon: "□", color: "bg-muted" },
  NOT_ANSWERED: { label: "Not Answered", icon: "○", color: "bg-red-500" },
  ANSWERED: { label: "Answered", icon: "●", color: "bg-green-600" },
  MARKED: { label: "Marked for Review", icon: "☆", color: "bg-purple-500" },
  ANSWERED_MARKED: {
    label: "Answered & Marked",
    icon: "★",
    color: "bg-purple-700",
  },
};
