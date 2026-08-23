/**
 * Sanitization helpers — strip HTML and control characters to prevent XSS/storage injection.
 */

export function stripHtml(input: string): string {
  // Remove tags, keep inner text
  return input.replace(/<[^>]*>/g, "").trim();
}

export function sanitizeText(input: string, maxLength = 2000): string {
  // Strip HTML, collapse excessive whitespace, remove control chars except \n \t
  let out = stripHtml(input);
  // Remove control characters (0x00-0x1F except \n \r \t, 0x7F)
  out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Collapse 3+ newlines to 2
  out = out.replace(/\n{3,}/g, "\n\n");
  if (out.length > maxLength) out = out.slice(0, maxLength);
  return out.trim();
}

export function sanitizeDescription(input: string): string {
  return sanitizeText(input, 2000);
}
