import { promises as fs } from "fs";
import path from "path";

/**
 * Storage abstraction — supports local filesystem (dev) and R2/S3 (production).
 * Switch is automatic via isR2Configured().
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

export function isR2Configured(): boolean {
  return (
    !!process.env.R2_ACCOUNT_ID &&
    !!process.env.R2_BUCKET &&
    !!process.env.R2_ACCESS_KEY_ID &&
    !!process.env.R2_SECRET_ACCESS_KEY
  );
}

function sanitizeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 100);
  return base || "upload.pdf";
}

async function saveToR2(buffer: Buffer, key: string): Promise<void> {
  let S3Client: unknown, PutObjectCommand: unknown;
  try {
    const mod = await import(/* webpackIgnore: true */ "@aws-sdk/client-s3");
    S3Client = (mod as unknown as { S3Client: unknown }).S3Client;
    PutObjectCommand = (mod as unknown as { PutObjectCommand: unknown })
      .PutObjectCommand;
  } catch {
    throw new Error(
      "R2 SDK not installed: npm install @aws-sdk/client-s3 to enable R2 storage"
    );
  }
  const Client = S3Client as unknown as new (opts: unknown) => {
    send: (cmd: unknown) => Promise<void>;
  };
  const Cmd = PutObjectCommand as unknown as new (opts: unknown) => unknown;
  const client = new Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  await client.send(
    new Cmd({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
    })
  );
}

async function getFromR2(key: string): Promise<Buffer> {
  let S3Client: unknown, GetObjectCommand: unknown;
  try {
    const mod = await import(/* webpackIgnore: true */ "@aws-sdk/client-s3");
    S3Client = (mod as unknown as { S3Client: unknown }).S3Client;
    GetObjectCommand = (mod as unknown as { GetObjectCommand: unknown })
      .GetObjectCommand;
  } catch {
    throw new Error("R2 SDK not installed");
  }
  const Client = S3Client as unknown as new (opts: unknown) => {
    send: (cmd: unknown) => Promise<{
      Body?: { transformToByteArray: () => Promise<Uint8Array> };
    }>;
  };
  const Cmd = GetObjectCommand as unknown as new (opts: unknown) => unknown;
  const client = new Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const res = await client.send(
    new Cmd({ Bucket: process.env.R2_BUCKET!, Key: key })
  );
  const bytes = await (
    res.Body as unknown as { transformToByteArray: () => Promise<Uint8Array> }
  ).transformToByteArray();
  return Buffer.from(bytes);
}

export async function saveFile(
  buffer: Buffer,
  fileName: string
): Promise<StoredFile> {
  const safeName = sanitizeFileName(fileName);
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;
  if (isR2Configured()) {
    await saveToR2(buffer, key);
    const publicUrl = process.env.R2_PUBLIC_URL
      ? `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`
      : `/api/storage/${key}`;
    return { key, url: publicUrl, size: buffer.length };
  }
  await ensureUploadDir();
  const filePath = path.join(UPLOAD_DIR, key);
  await fs.writeFile(filePath, buffer);
  return { key, url: `/storage/${key}`, size: buffer.length };
}

export async function getFileBuffer(key: string): Promise<Buffer> {
  if (isR2Configured()) {
    try {
      return await getFromR2(key);
    } catch {
      // Fallback to local if R2 miss (migration case)
    }
  }
  const filePath = path.join(UPLOAD_DIR, key);
  return fs.readFile(filePath);
}
