/**
 * Sanitization helpers — strip HTML, control chars, and dangerous URL schemes.
 * For rich rendering, prefer escaping on output (React auto-escapes). This is for storage.
 */

export function stripHtml(input: string): string {
  // Remove tags, keep inner text. Handles malformed tags conservatively.
  return input.replace(/<[^>]*>/g, "").trim();
}

export function sanitizeText(input: string, maxLength = 2000): string {
  let out = stripHtml(input);
  // Remove control characters (0x00-0x1F except \n \r \t, 0x7F)
  out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Strip dangerous URL schemes that may survive stripping (e.g. javascript:alert)
  out = out.replace(/\b(javascript|data|vbscript):[^\s]*/gi, "");
  // Collapse 3+ newlines to 2
  out = out.replace(/\n{3,}/g, "\n\n");
  if (out.length > maxLength) out = out.slice(0, maxLength);
  return out.trim();
}

export function sanitizeDescription(input: string): string {
  return sanitizeText(input, 2000);
}

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "http://localhost");
    const proto = parsed.protocol.toLowerCase();
    return (
      ["http:", "https:", "blob:", "data:"].includes(proto) &&
      !/javascript:/i.test(url)
    );
  } catch {
    return false;
  }
}

export function sanitizeUrl(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (
    /^javascript:/i.test(trimmed) ||
    (/^data:/i.test(trimmed) && !trimmed.startsWith("data:image/"))
  )
    return null;
  if (trimmed.includes("<") || trimmed.includes(">")) return null;
  return trimmed.slice(0, 2048);
}
