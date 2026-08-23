import { z } from "zod";

export const timingConfigSchema = z.object({
  totalSec: z.number().int().positive().max(24 * 60 * 60),
  warningSec: z.number().int().min(0).max(3600).optional().default(300),
  sectionTimers: z.record(z.string(), z.number().int().positive()).optional(),
});

export const markingRuleSchema = z.object({
  marks: z.number().min(0),
  negative: z.number().min(0),
});

export const markingConfigSchema = z.object({
  perSection: z.record(z.string(), markingRuleSchema).optional(),
  default: markingRuleSchema.default({ marks: 1, negative: 0 }),
  bonusAllowed: z.boolean().default(true),
});

export const navigationModeSchema = z.enum(["free", "sequential", "section-lock"]);

export const navigationConfigSchema = z.object({
  mode: navigationModeSchema.default("free"),
  sectionOrder: z.array(z.string()).optional(),
});

export const examConfigSchema = z.object({
  timing: timingConfigSchema,
  marking: markingConfigSchema.default({ default: { marks: 1, negative: 0 }, bonusAllowed: true }),
  navigation: navigationConfigSchema.default({ mode: "free" }),
  questionTypes: z.array(z.string()).default(["SCQ"]),
});

export type ExamConfig = z.infer<typeof examConfigSchema>;
export type TimingConfig = z.infer<typeof timingConfigSchema>;
export type MarkingConfig = z.infer<typeof markingConfigSchema>;
export type NavigationConfig = z.infer<typeof navigationConfigSchema>;

export const questionTypeSchema = z.enum(["SCQ", "MCQ", "NUMERIC", "TRUE_FALSE", "PASSAGE", "IMAGE_BASED"]);

export const createQuestionSchema = z.object({
  type: questionTypeSchema.default("SCQ"),
  text: z.string().min(1),
  order: z.number().int().min(0),
  marks: z.number().min(0).default(1),
  negativeMarks: z.number().min(0).default(0),
  isBonus: z.boolean().default(false),
  isCancelled: z.boolean().default(false),
  options: z.array(z.object({ label: z.string(), text: z.string().min(1), order: z.number().int().min(0), isCorrect: z.boolean().default(false) })).min(2).max(6),
});

// Validation helper for publishing
// Returns warnings, throws if invalid

export function validateExamConfig(config: unknown) {
  return examConfigSchema.parse(config);
}
