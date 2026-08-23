import { promises as fs } from "fs";
import path from "path";

/**
 * Storage abstraction — Phase 7 uses local filesystem for dev.
 * When R2 env vars are set, switch to S3/R2 (not yet implemented, stub).
 * Interface allows swapping without changing callers.
 */
export interface StoredFile {
  key: string;
  url: string;
  size: number;
}

const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function saveFile(buffer: Buffer, fileName: string): Promise<StoredFile> {
  await ensureUploadDir();
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const filePath = path.join(UPLOAD_DIR, key);
  await fs.writeFile(filePath, buffer);
  return { key, url: `/storage/${key}`, size: buffer.length };
}

export async function getFileBuffer(key: string): Promise<Buffer> {
  const filePath = path.join(UPLOAD_DIR, key);
  return fs.readFile(filePath);
}

export function isR2Configured(): boolean {
  return !!process.env.R2_ACCOUNT_ID && !!process.env.R2_BUCKET;
}
