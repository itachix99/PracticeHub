import { renderPageAsImage } from "unpdf";

/**
 * OCR abstraction — Phase 9: Azure Document Intelligence (primary) + Tesseract fallback.
 * Works in Node: renders PDF pages to PNG via @napi-rs/canvas then OCRs.
 */

export function isAzureConfigured(): boolean {
  const ep = process.env.AZURE_DI_ENDPOINT;
  const key = process.env.AZURE_DI_KEY;
  return !!ep && !!key && process.env.AZURE_DI_ENABLED !== "false";
}

interface AzureAnalyzeResult {
  status: string;
  analyzeResult?: {
    content?: string;
    pages?: Array<{ pageNumber: number; content?: string; lines?: Array<{ content: string }> }>;
  };
}

/**
 * Azure Document Intelligence prebuilt-read on a PDF buffer.
 * Returns per-page text map. Polls Operation-Location until succeeded.
 */
export async function azureOcrPdf(buffer: Buffer): Promise<Map<number, string>> {
  const endpoint = process.env.AZURE_DI_ENDPOINT!.replace(/\/$/, "");
  const key = process.env.AZURE_DI_KEY!;
  const url = `${endpoint}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2023-07-31`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/pdf",
    },
    body: buffer as unknown as BodyInit,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Azure DI analyze failed ${res.status}: ${txt.slice(0, 500)}`);
  }

  const opLocation = res.headers.get("operation-location") || res.headers.get("Operation-Location");
  if (!opLocation) throw new Error("Azure DI: missing Operation-Location header");

  // Poll
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1000 + i * 500));
    const poll = await fetch(opLocation, {
      headers: { "Ocp-Apim-Subscription-Key": key },
    });
    if (!poll.ok) throw new Error(`Azure poll failed ${poll.status}`);
    const data = (await poll.json()) as AzureAnalyzeResult;
    if (data.status === "succeeded" && data.analyzeResult) {
      const map = new Map<number, string>();
      const pages = data.analyzeResult.pages || [];
      for (const p of pages) {
        const pgNum = (p as unknown as { pageNumber: number }).pageNumber || 0;
        const text = p.content || (p.lines ? p.lines.map((l) => l.content).join("\n") : "");
        if (pgNum) map.set(pgNum, text);
      }
      // Fallback: if pages empty but content exists, split roughly per page marker? Use content for page 1
      if (map.size === 0 && data.analyzeResult.content) {
        map.set(1, data.analyzeResult.content);
      }
      return map;
    }
    if (data.status === "failed") throw new Error("Azure DI analysis failed");
    // else running/notStarted -> continue
  }
  throw new Error("Azure DI poll timeout");
}

/**
 * Tesseract OCR for specific pages via rendering.
 * Renders each page to PNG (scale 2) via unpdf + @napi-rs/canvas then OCRs.
 */
export async function tesseractOcrPages(
  buffer: Buffer,
  pageNumbers: number[]
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (pageNumbers.length === 0) return result;

  // Dynamic import to keep native deps server-only
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  try {
    const data = new Uint8Array(buffer);
    for (const pageNum of pageNumbers) {
      try {
        const img = await renderPageAsImage(data, pageNum, {
          scale: 2,
          canvasImport: () => import("@napi-rs/canvas"),
        });
        const pngBuf = Buffer.from(img as ArrayBuffer);
        const ret = await worker.recognize(pngBuf);
        const text = (ret.data.text || "").trim();
        result.set(pageNum, text);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[ocr] page ${pageNum} failed: ${msg}`);
        result.set(pageNum, "");
      }
    }
  } finally {
    try { await worker.terminate(); } catch {}
  }
  return result;
}

/**
 * Top-level OCR: tries Azure first if configured, else Tesseract.
 * pageNumbers: which pages to OCR (e.g., those with hasText===false).
 * If Azure succeeds, returns its map; otherwise falls back to Tesseract.
 */
export async function ocrPdfPagesWithFallback(
  buffer: Buffer,
  pageNumbers: number[],
  onLog?: (msg: string, level?: "info"|"warn") => void
): Promise<{ map: Map<number, string>; provider: "azure" | "tesseract" | "none" }> {
  if (pageNumbers.length === 0) return { map: new Map(), provider: "none" };

  if (isAzureConfigured()) {
    try {
      onLog?.(`Attempting Azure DI OCR for ${pageNumbers.length} page(s)`);
      const azureMap = await azureOcrPdf(buffer);
      // Filter to requested pages (Azure returns all)
      const filtered = new Map<number, string>();
      for (const n of pageNumbers) {
        filtered.set(n, azureMap.get(n) ?? "");
      }
      // If Azure returned empty for requested pages, fallback
      const hasContent = Array.from(filtered.values()).some((v) => v.trim().length > 0);
      if (hasContent) {
        onLog?.(`Azure DI succeeded`);
        return { map: filtered, provider: "azure" };
      }
      onLog?.(`Azure DI returned empty, falling back to Tesseract`, "warn");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onLog?.(`Azure DI failed (${msg}), falling back to Tesseract`, "warn");
    }
  }

  onLog?.(`Using Tesseract fallback for ${pageNumbers.length} page(s)`);
  const tessMap = await tesseractOcrPages(buffer, pageNumbers);
  return { map: tessMap, provider: "tesseract" };
}
