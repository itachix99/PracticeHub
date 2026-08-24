import { z } from "zod";
import {
  aiExtractionSchema,
  generateQuestionsWithAi,
  resolveAiProvider,
  type AiExtractionOutput,
} from "../ai/provider";

/**
 * AI Question Extraction — heuristic mock + Vercel AI SDK.
 * Never invent answers; flag needsReview if ambiguous.
 * P2-A: improved boundary-aware chunking and regex robustness.
 */

export type ExtractedQuestionsResult = AiExtractionOutput & {
  provider: "openai" | "anthropic" | "mock";
  questionCount: number;
};

/**
 * Boundary-aware chunking: split on question boundaries when possible (\nQ d) instead of fixed overlap,
 * then pack up to chunkSize. Preserves question integrity.
 */
export function chunkText(
  text: string,
  chunkSize = 6000,
  _overlap = 200
): string[] {
  void _overlap;
  if (text.length <= chunkSize) return [text];
  // Find all question starts
  const qStartRegex = /(?:^|\n)\s*(?:Q(?:uestion)?\s*)?\d+\s*[.)]/gm;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = qStartRegex.exec(text)) !== null) {
    const idx = m.index + (m[0].startsWith("\n") ? 1 : 0);
    starts.push(idx);
  }
  if (starts.length <= 1) {
    // Fallback to fixed chunks if no Q markers
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      if (end === text.length) break;
      start = end - 200;
    }
    return chunks;
  }
  const chunks: string[] = [];
  let cur = "";
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    const end = starts[i + 1] ?? text.length;
    const block = text.slice(start, end);
    if ((cur + block).length > chunkSize && cur.length > 0) {
      chunks.push(cur.trim());
      cur = block;
    } else {
      cur += block;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  // If first chunk missing preamble before first Q, prepend it
  if (starts[0]! > 0 && chunks.length > 0) {
    const preamble = text.slice(0, starts[0]).trim();
    if (preamble) chunks[0] = preamble + "\n\n" + chunks[0]!;
  }
  return chunks;
}

/**
 * Heuristic parser for offline/mock mode. Supports Q1., 1., (1), Q.1 patterns and lower-case options.
 */
export function heuristicExtract(fullText: string): AiExtractionOutput {
  const warnings: string[] = [];
  const questions: z.infer<typeof aiExtractionSchema>["questions"] = [];

  const normalized = fullText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return {
      questions: [],
      needsReview: true,
      warnings: ["Empty text - no questions found"],
    };
  }

  const normalizedForQ = normalized
    .replace(/Q\s*[lI]\s*[.)]/gi, (x) => x.replace(/[lI]/, "1"))
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  // Robust Q block: matches Q1., 1., Q1), (1), Question 1., etc. Requires newline or start before Q/number
  const qRegex =
    /(?:^|\n)\s*(?:Q(?:uestion)?\s*)?(\d+)\s*[.)]\s*([\s\S]*?)(?=(?:\n\s*(?:Q(?:uestion)?\s*)?\d+\s*[.)])|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = qRegex.exec(normalizedForQ)) !== null) {
    const qNum = match[1];
    let block = (match[2] ?? "").trim();
    if (!block) continue;

    let correctOptionLabel: string | undefined;
    const ansMatch = block.match(/(?:Ans(?:wer)?\s*[:\-\=]\s*([A-Da-d]))/);
    if (ansMatch) {
      correctOptionLabel = ansMatch[1]?.toUpperCase();
      block = block.replace(ansMatch[0], "").trim();
    } else {
      // Check trailing (A) marker
      const trailParen = block.match(/\(\s*([A-Da-d])\s*\)\s*$/);
      if (trailParen) {
        correctOptionLabel = trailParen[1]?.toUpperCase();
        block = block.replace(trailParen[0], "").trim();
      }
    }

    // Find first option: A) / a. / (A) /  A.
    const optRegex = /(?:\n|^)\s*(?:\()?\s*([A-Da-d])\s*[.)]\s*/g;
    let optStartIdx = -1;
    let optM: RegExpExecArray | null;
    while ((optM = optRegex.exec(block)) !== null) {
      optStartIdx = optM.index;
      break;
    }
    // Fallback case-insensitive search
    if (optStartIdx === -1) {
      const fallback = block.search(/\b[A-Da-d]\s*[).]/);
      optStartIdx = fallback;
    }
    let stem = block;
    let optionsPart = "";
    if (optStartIdx !== -1) {
      stem = block.slice(0, optStartIdx).trim();
      optionsPart = block.slice(optStartIdx).trim();
    }

    stem = stem.replace(/^\s*\d+[.)]\s*/, "").trim();
    if (!stem) {
      warnings.push(`Q${qNum} has empty stem`);
      stem = `Question ${qNum}`;
    }

    const options: Array<{ label: string; text: string }> = [];
    if (optionsPart) {
      // Split on option markers case-insensitive: A) B) etc. Handles (A) too
      const parts = optionsPart
        .split(/(?=\b[A-Da-d]\s*[).]|\(\s*[A-Da-d]\s*\))/g)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const part of parts) {
        const m = part.match(/^\(?\s*([A-Da-d])\s*\)?\s*[.)]?\s*([\s\S]*)/);
        if (!m) continue;
        const label = m[1]!.toUpperCase();
        let text = (m[2] ?? "").trim();
        text = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
        // Trim trailing answer marker remnants
        text = text.replace(/\s*Ans\s*[:\-].*$/i, "").trim();
        if (label && text) {
          if (!options.some((o) => o.label === label))
            options.push({ label, text });
        }
      }
    }

    const type =
      options.length === 0
        ? "NUMERIC"
        : options.length === 2 &&
            options.some((o) => /true|false/i.test(o.text))
          ? "TRUE_FALSE"
          : "SCQ";

    questions.push({
      text: stem.slice(0, 2000),
      type: type as "SCQ" | "MCQ" | "NUMERIC" | "TRUE_FALSE" | "PASSAGE",
      options,
      correctOptionLabel,
      explanation: undefined,
      marks: undefined,
    });
  }

  if (questions.length === 0 && normalized.length > 50) {
    warnings.push(
      'Heuristic found 0 questions with Q pattern - text may not be in expected format (try "1." or "Q1." numbering)'
    );
  }

  const needsReview =
    questions.length === 0 ||
    warnings.length > 0 ||
    questions.some((q) => q.options.length === 0 && q.type !== "NUMERIC") ||
    normalized.length < 100;

  if (questions.length === 0)
    warnings.push("No questions extracted - needs manual review");

  return {
    questions,
    needsReview,
    warnings: warnings.length ? warnings : undefined,
  };
}

export async function extractQuestionsFromText(
  fullText: string,
  opts?: { onLog?: (msg: string, level?: "info" | "warn") => void }
): Promise<ExtractedQuestionsResult> {
  const provider = resolveAiProvider();
  opts?.onLog?.(
    `AI extraction provider: ${provider}, text length ${fullText.length}`
  );

  if (provider === "mock") {
    const result = heuristicExtract(fullText);
    return {
      ...result,
      provider: "mock",
      questionCount: result.questions.length,
    };
  }

  const chunks = chunkText(fullText, 6000);
  opts?.onLog?.(
    `Chunked into ${chunks.length} part(s) for AI (boundary-aware)`
  );
  const allQuestions: AiExtractionOutput["questions"] = [];
  let needsReview = false;
  const warnings: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    try {
      const res = await generateQuestionsWithAi(chunk, { onLog: opts?.onLog });
      allQuestions.push(...res.questions);
      if (res.needsReview) needsReview = true;
      if (res.warnings)
        warnings.push(...res.warnings.map((w) => `[chunk ${i + 1}] ${w}`));
      aiExtractionSchema.parse(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      opts?.onLog?.(
        `AI chunk ${i + 1} failed: ${msg} - falling back to heuristic for this chunk`
      );
      const heur = heuristicExtract(chunk);
      allQuestions.push(
        ...heur.questions.map((q) => ({
          ...q,
          text: `[chunk ${i + 1}] ${q.text}`,
        }))
      );
      needsReview = true;
      warnings.push(`Chunk ${i + 1} AI failed: ${msg}`);
    }
  }

  // Dedupe by normalized stem hash (first 120 chars + option set hash) to preserve distinct Qs with same prefix
  const seen = new Set<string>();
  const deduped = allQuestions.filter((q) => {
    const optHash = q.options
      .map((o) => o.label + ":" + o.text.slice(0, 20))
      .join("|");
    const key =
      q.text.slice(0, 120).trim().toLowerCase() + "::" + optHash.slice(0, 80);
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
