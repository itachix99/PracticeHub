import { extractText, getDocumentProxy, getMeta } from "unpdf";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
  charCount: number;
  hasText: boolean;
}

export interface ExtractionOutput {
  totalPages: number;
  pages: ExtractedPage[];
  fullText: string;
  meta: Record<string, unknown>;
  avgCharsPerPage: number;
  textCoverage: number; // 0-1 fraction of pages with hasText
  needsOcr: boolean;
}

const MIN_CHARS_FOR_TEXT_PAGE = 50;

/**
 * Extract text from a PDF buffer using unpdf (PDF.js serverless).
 * Preserves per-page text and page dimensions.
 */
export async function extractPdfText(
  buffer: Buffer
): Promise<ExtractionOutput> {
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);

  // Extract per-page text
  const { totalPages, text: raw } = await extractText(pdf, {
    mergePages: false,
  });
  const perPageText = Array.isArray(raw) ? (raw as string[]) : [raw as string];

  // Meta (best-effort)
  let meta: Record<string, unknown> = {};
  try {
    const m = await getMeta(pdf);
    meta = {
      ...(m.info as unknown as Record<string, unknown>),
      ...(m.metadata as unknown as Record<string, unknown>),
    };
  } catch {
    // ignore
  }

  const pages: ExtractedPage[] = [];
  let totalChars = 0;
  let pagesWithText = 0;

  for (let i = 1; i <= totalPages; i++) {
    const rawText = perPageText[i - 1] ?? "";
    const trimmed = rawText.trim();
    const charCount = trimmed.length;
    totalChars += charCount;
    const hasText = charCount >= MIN_CHARS_FOR_TEXT_PAGE;
    if (hasText) pagesWithText++;

    // Get page dimensions via PDF.js page proxy
    let width = 0;
    let height = 0;
    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      width = viewport.width;
      height = viewport.height;
    } catch {
      // leave 0,0 if unavailable
    }

    pages.push({
      pageNumber: i,
      text: rawText,
      width,
      height,
      charCount,
      hasText,
    });
  }

  const fullText = perPageText.join("\n\n");
  const avgCharsPerPage =
    totalPages > 0 ? Math.round(totalChars / totalPages) : 0;
  const textCoverage = totalPages > 0 ? pagesWithText / totalPages : 0;
  // Heuristic: needs OCR if < 50% pages have meaningful text
  const needsOcr = textCoverage < 0.5;

  return {
    totalPages,
    pages,
    fullText,
    meta,
    avgCharsPerPage,
    textCoverage,
    needsOcr,
  };
}

/**
 * Quick helper to decide if buffer is text-based enough for Phase 8.
 */
export function isTextBased(output: ExtractionOutput): boolean {
  return !output.needsOcr;
}
