import { renderPageAsImage } from "unpdf";

/**
 * OCR abstraction — Azure DI (primary) + Tesseract fallback (pooled worker, timeouts).
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
    pages?: Array<{
      pageNumber: number;
      content?: string;
      lines?: Array<{ content: string }>;
    }>;
  };
}

export async function azureOcrPdf(
  buffer: Buffer
): Promise<Map<number, string>> {
  const endpoint = process.env.AZURE_DI_ENDPOINT!.replace(/\/$/, "");
  const key = process.env.AZURE_DI_KEY!;
  const url = `${endpoint}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2023-07-31`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/pdf",
      },
      body: buffer as unknown as BodyInit,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `Azure DI analyze failed ${res.status}: ${txt.slice(0, 500)}`
    );
  }
  const opLocation =
    res.headers.get("operation-location") ||
    res.headers.get("Operation-Location");
  if (!opLocation)
    throw new Error("Azure DI: missing Operation-Location header");

  const maxAttempts = 12;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1000 + i * 400));
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 8000);
    let poll: Response;
    try {
      poll = await fetch(opLocation, {
        headers: { "Ocp-Apim-Subscription-Key": key },
        signal: ctrl2.signal,
      });
    } finally {
      clearTimeout(t2);
    }
    if (!poll.ok) throw new Error(`Azure poll failed ${poll.status}`);
    const data = (await poll.json()) as AzureAnalyzeResult;
    if (data.status === "succeeded" && data.analyzeResult) {
      const map = new Map<number, string>();
      const pages = data.analyzeResult.pages || [];
      for (const p of pages) {
        const pgNum = (p as unknown as { pageNumber: number }).pageNumber || 0;
        const text =
          p.content ||
          (p.lines ? p.lines.map((l) => l.content).join("\n") : "");
        if (pgNum) map.set(pgNum, text);
      }
      if (map.size === 0 && data.analyzeResult.content)
        map.set(1, data.analyzeResult.content);
      return map;
    }
    if (data.status === "failed") throw new Error("Azure DI analysis failed");
  }
  throw new Error("Azure DI poll timeout");
}

// Singleton Tesseract worker
let singletonWorker: unknown = null;
let workerReady: Promise<unknown> | null = null;

async function getWorker() {
  if (singletonWorker)
    return singletonWorker as {
      recognize: (buf: Buffer) => Promise<{ data: { text: string } }>;
      terminate?: () => Promise<void>;
    };
  if (!workerReady) {
    workerReady = (async () => {
      const { createWorker } = await import("tesseract.js");
      const w = await createWorker("eng");
      singletonWorker = w;
      return w;
    })();
  }
  return (await workerReady) as {
    recognize: (buf: Buffer) => Promise<{ data: { text: string } }>;
    terminate?: () => Promise<void>;
  };
}

export async function tesseractOcrPages(
  buffer: Buffer,
  pageNumbers: number[]
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (pageNumbers.length === 0) return result;
  const worker = await getWorker();
  const data = new Uint8Array(buffer);
  for (const pageNum of pageNumbers) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const renderPromise = renderPageAsImage(data, pageNum, {
        scale: 1.5,
        canvasImport: () => import("@napi-rs/canvas"),
      });
      const timeoutPromise = new Promise<never>((_, rej) => {
        timeout = setTimeout(() => rej(new Error("render timeout")), 15000);
      });
      const img = (await Promise.race([
        renderPromise,
        timeoutPromise,
      ])) as ArrayBuffer;
      clearTimeout(timeout);
      const pngBuf = Buffer.from(img as ArrayBuffer);
      const withTimeout = Promise.race([
        worker.recognize(pngBuf),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("tesseract timeout")), 15000)
        ),
      ]);
      const ret = (await withTimeout) as { data: { text: string } };
      result.set(pageNum, (ret.data.text || "").trim());
    } catch (e) {
      clearTimeout(timeout);
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[ocr] page ${pageNum} failed: ${msg}`);
      result.set(pageNum, "");
    }
  }
  return result;
}

export async function ocrPdfPagesWithFallback(
  buffer: Buffer,
  pageNumbers: number[],
  onLog?: (msg: string, level?: "info" | "warn") => void
): Promise<{
  map: Map<number, string>;
  provider: "azure" | "tesseract" | "none";
}> {
  if (pageNumbers.length === 0) return { map: new Map(), provider: "none" };
  if (isAzureConfigured()) {
    try {
      onLog?.(`Attempting Azure DI OCR for ${pageNumbers.length} page(s)`);
      const azureMap = await azureOcrPdf(buffer);
      const filtered = new Map<number, string>();
      for (const n of pageNumbers) filtered.set(n, azureMap.get(n) ?? "");
      const hasContent = Array.from(filtered.values()).some(
        (v) => v.trim().length > 0
      );
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
