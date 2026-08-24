export type QuestionState =
  "NOT_VISITED" | "NOT_ANSWERED" | "ANSWERED" | "MARKED" | "ANSWERED_MARKED";
export type QuestionType =
  "SCQ" | "MCQ" | "NUMERIC" | "TRUE_FALSE" | "PASSAGE" | "IMAGE_BASED";
export type AttemptStatus =
  "CREATED" | "IN_PROGRESS" | "SUBMITTED" | "EXPIRED" | "ABANDONED";
export type NavigationMode = "free" | "sequential" | "section-lock";

export interface ExamConfig {
  timing: {
    totalSec: number;
    warningSec?: number;
    sectionTimers?: Record<string, number>;
  };
  marking: {
    perSection?: Record<string, { marks: number; negative: number }>;
    default: { marks: number; negative: number };
    bonusAllowed: boolean;
  };
  navigation: { mode: NavigationMode; sectionOrder?: string[] };
  questionTypes: string[];
}

export interface MarkingResult {
  score: number;
  maxScore: number;
  correct: number;
  incorrect: number;
  attempted: number;
  unattempted: number;
  negative: number;
  percentage: number;
  sectionWise: Array<{
    sectionId: string;
    score: number;
    max: number;
    attempted: number;
    correct: number;
    accuracy: number;
  }>;
}

export interface ScoredQuestion {
  questionId: string;
  sectionId: string;
  marks: number;
  negativeMarks: number;
  isBonus: boolean;
  isCancelled: boolean;
  correctOptionId: string | null;
  selectedOptionId: string | null;
}
