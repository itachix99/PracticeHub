/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";

/**
 * AI provider abstraction - Phase 10: Vercel AI SDK with mock fallback.
 * Prefers OPENAI if key present, else Anthropic, else mock heuristic.
 */

export type AiProvider = "openai" | "anthropic" | "mock";

export function resolveAiProvider(): AiProvider {
  const forced = process.env.AI_PROVIDER as AiProvider | undefined;
  if (forced === "mock") return "mock";
  if (forced === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY)
    return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "mock";
}

// Zod schemas for structured output
export const questionOptionSchema = z.object({
  label: z.string().describe("Option label e.g. A, B, C, D"),
  text: z.string().describe("Option text"),
});

export const extractedQuestionSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe("Question stem verbatim from paper, no hallucination"),
  type: z
    .enum(["SCQ", "MCQ", "NUMERIC", "TRUE_FALSE", "PASSAGE"])
    .default("SCQ")
    .describe("Question type"),
  options: z
    .array(questionOptionSchema)
    .max(6)
    .default([])
    .describe("Options in order, empty for NUMERIC"),
  correctOptionLabel: z
    .string()
    .optional()
    .describe(
      "Correct option label if explicitly marked in source (e.g. Ans: A), else omit"
    ),
  explanation: z
    .string()
    .optional()
    .describe("Explanation if present in source"),
  marks: z.number().optional().describe("Marks if mentioned"),
});

export const aiExtractionSchema = z.object({
  questions: z
    .array(extractedQuestionSchema)
    .describe("Extracted questions verbatim, do not invent"),
  needsReview: z
    .boolean()
    .describe(
      "true if any extraction is ambiguous, incomplete, or low confidence"
    ),
  warnings: z
    .array(z.string())
    .optional()
    .describe("Warnings for ambiguous cases"),
});

export type AiExtractionOutput = z.infer<typeof aiExtractionSchema>;

/**
 * Generate structured questions via Vercel AI SDK. Falls back to mock if no key.
 */
export async function generateQuestionsWithAi(
  fullText: string,
  opts?: { onLog?: (msg: string) => void }
): Promise<AiExtractionOutput> {
  const provider = resolveAiProvider();
  opts?.onLog?.(`AI provider: ${provider}`);

  if (provider === "mock") {
    throw new Error("Mock provider - use heuristic");
  }

  const prompt = `You are an exam paper parser for PracticeHub.
Extract questions VERBATIM from the following exam paper text. Do not invent, rephrase, or hallucinate.
- Keep question text exactly as in source (including numbers/punctuation).
- Preserve options A), B), C), D) etc. as separate options with label and text.
- If correct answer is explicitly marked (e.g. "Ans: A" or "*"), set correctOptionLabel, otherwise omit.
- If question is ambiguous, truncated, or you are uncertain, set needsReview=true and add warning.
- Return empty questions array if no questions found, with needsReview=true.
- Do NOT invent answers or explanations.

Paper text:
"""
${fullText.slice(0, 15000)}
"""`;

  if (provider === "openai") {
    const { generateObject } = await import("ai");
    const { openai } = await import("@ai-sdk/openai");
    const { object } = await generateObject({
      model: openai("gpt-4o-mini") as unknown as any,
      schema: aiExtractionSchema,
      prompt,
      temperature: 0,
    });
    return object;
  }

  if (provider === "anthropic") {
    const { generateObject } = await import("ai");
    // anthropic package not installed yet, but we handle dynamically; if not installed, fallback
    try {
      const mod = await import("@ai-sdk/anthropic");
      const anthropicFn = (
        mod as unknown as { anthropic: (m: string) => unknown }
      ).anthropic;
      const { object } = await generateObject({
        model: anthropicFn("claude-3-5-sonnet-20241022") as unknown as any,
        schema: aiExtractionSchema,
        prompt,
        temperature: 0,
      });
      return object;
    } catch {
      throw new Error(
        "Anthropic provider not available, install @ai-sdk/anthropic"
      );
    }
  }

  throw new Error(`Unknown provider ${provider}`);
}
