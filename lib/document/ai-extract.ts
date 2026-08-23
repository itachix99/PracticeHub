import { z } from "zod";
import { aiExtractionSchema, generateQuestionsWithAi, resolveAiProvider, type AiExtractionOutput } from "../ai/provider";

/**
 * AI Question Extraction - Phase 10: heuristic mock + Vercel AI SDK.
 * Never invent answers; flag needsReview if ambiguous.
 */

export type ExtractedQuestionsResult = AiExtractionOutput & {
  provider: "openai" | "anthropic" | "mock";
  questionCount: number;
};

function chunkText(text: string, chunkSize = 6000, overlap = 200): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - overlap;
  }
  return chunks;
}

/**
 * Heuristic parser for offline/mock mode. Parses Q1. ... A) ... B) ... patterns.
 */
export function heuristicExtract(fullText: string): AiExtractionOutput {
  const warnings: string[] = [];
  const questions: z.infer<typeof aiExtractionSchema>["questions"] = [];

  const normalized = fullText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { questions: [], needsReview: true, warnings: ["Empty text - no questions found"] };
  }

  // Find question blocks: Q1. ... until next Q or end
  // Normalize OCR errors: Ql. -> Q1., QI -> Q1 etc., before regex
  const normalizedForQ = normalized.replace(/Q\s*[lI]\s*[.)]/gi, (m) => m.replace(/[lI]/, "1"));
  const qRegex = /Q\s*(\d+)\s*[.)]\s*([\s\S]*?)(?=(?:\n\s*Q\s*\d+\s*[.)])|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = qRegex.exec(normalizedForQ)) !== null) {
    const qNum = match[1];
    let block = (match[2] ?? "").trim();
    if (!block) continue;

    // Detect answer marker inside block e.g. "Ans: A" or "Answer: B" or "(A)" at end?
    let correctOptionLabel: string | undefined;
    const ansMatch = block.match(/(?:Ans(?:wer)?\s*[:\-]\s*([A-D]))/i);
    if (ansMatch) {
      correctOptionLabel = ansMatch[1]?.toUpperCase();
      // Remove answer marker from block for cleaner question/options
      block = block.replace(ansMatch[0], "").trim();
    }

    // Split question text vs options: find first "A)" or "A." occurrence
    const optStartIdx = block.search(/\b[A-D]\s*[).]/);
    let stem = block;
    let optionsPart = "";
    if (optStartIdx !== -1) {
      stem = block.slice(0, optStartIdx).trim();
      optionsPart = block.slice(optStartIdx).trim();
    }

    // Clean stem: remove leading numbering if leftover
    stem = stem.replace(/^\s*\d+[.)]\s*/, "").trim();
    if (!stem) {
      warnings.push(`Q${qNum} has empty stem`);
      stem = `Question ${qNum}`;
    }

    const options: Array<{ label: string; text: string }> = [];
    if (optionsPart) {
      // Robust split: split before each A) B) C) D) label
      const parts = optionsPart.split(/(?=\b[A-D]\s*[).])/g).map(s=>s.trim()).filter(Boolean);
      for (const part of parts) {
        const m = part.match(/^([A-D])\s*[).]\s*([\s\S]*)/);
        if (m) {
          const label = m[1]!.toUpperCase();
          let text = (m[2] ?? "").trim();
          text = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
          // Remove trailing next label if mistakenly included (due to split failure)
          // Already split, so text should be clean
          if (label && text) options.push({ label, text });
        }
      }
    }

    const type = options.length === 0 ? "NUMERIC" : options.length === 2 && options.some(o=>/true|false/i.test(o.text)) ? "TRUE_FALSE" : "SCQ";

    questions.push({
      text: stem.slice(0, 2000),
      type: type as "SCQ" | "MCQ" | "NUMERIC" | "TRUE_FALSE" | "PASSAGE",
      options,
      correctOptionLabel,
      explanation: undefined,
      marks: undefined,
    });
  }

  // Fallback if no Q pattern found but we have sizable text: try to treat whole text as one question?
  if (questions.length === 0 && normalized.length > 50) {
    warnings.push("Heuristic found 0 questions with Q pattern - text may not be in expected format");
  }

  const needsReview = questions.length === 0 || warnings.length > 0 || questions.some(q => q.options.length === 0 && q.type !== "NUMERIC") || normalized.length < 100;

  if (questions.length === 0) warnings.push("No questions extracted - needs manual review");

  return {
    questions,
    needsReview,
    warnings: warnings.length ? warnings : undefined,
  };
}

/**
 * Main entry: extract questions from fullText, using AI if configured else heuristic.
 * Handles chunking for large papers.
 */
export async function extractQuestionsFromText(
  fullText: string,
  opts?: { onLog?: (msg: string, level?: "info" | "warn") => void }
): Promise<ExtractedQuestionsResult> {
  const provider = resolveAiProvider();
  opts?.onLog?.(`AI extraction provider: ${provider}, text length ${fullText.length}`);

  if (provider === "mock") {
    const result = heuristicExtract(fullText);
    return {
      ...result,
      provider: "mock",
      questionCount: result.questions.length,
    };
  }

  // AI path with chunking
  const chunks = chunkText(fullText, 6000, 200);
  opts?.onLog?.(`Chunked into ${chunks.length} part(s) for AI`);
  const allQuestions: AiExtractionOutput["questions"] = [];
  let needsReview = false;
  const warnings: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    try {
      const res = await generateQuestionsWithAi(chunk, { onLog: opts?.onLog });
      allQuestions.push(...res.questions);
      if (res.needsReview) needsReview = true;
      if (res.warnings) warnings.push(...res.warnings.map(w => `[chunk ${i+1}] ${w}`));
      // Validate with zod (generateObject already validates)
      aiExtractionSchema.parse(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      opts?.onLog?.(`AI chunk ${i+1} failed: ${msg} - falling back to heuristic for this chunk`);
      const heur = heuristicExtract(chunk);
      allQuestions.push(...heur.questions.map(q => ({ ...q, text: `[chunk ${i+1}] ${q.text}` })));
      needsReview = true;
      warnings.push(`Chunk ${i+1} AI failed: ${msg}`);
    }
  }

  // Dedupe by text (simple)
  const seen = new Set<string>();
  const deduped = allQuestions.filter(q => {
    const key = q.text.slice(0, 100).trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length === 0) {
    needsReview = true;
    warnings.push("AI returned 0 questions - needs manual review");
  }

  return {
    questions: deduped,
    needsReview,
    warnings: warnings.length ? warnings : undefined,
    provider,
    questionCount: deduped.length,
  };
}
