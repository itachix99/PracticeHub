import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().min(1).default("file:./dev.db"),
    DIRECT_URL: z.string().optional(),
    NEXTAUTH_SECRET: z.string().min(1).optional(),
    AUTH_SECRET: z.string().min(1).optional(),
    NEXTAUTH_URL: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    AZURE_DI_ENDPOINT: z.string().optional(),
    AZURE_DI_KEY: z.string().optional(),
    AZURE_DI_ENABLED: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_PROVIDER: z.enum(["openai", "anthropic", "mock"]).optional(),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.string().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    TRUST_PROXY: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isProd = data.NODE_ENV === "production";
    if (isProd && !data.NEXTAUTH_SECRET && !data.AUTH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "NEXTAUTH_SECRET or AUTH_SECRET is required in production",
        path: ["NEXTAUTH_SECRET"],
      });
    }
    if (isProd) {
      const secret = data.NEXTAUTH_SECRET || data.AUTH_SECRET || "";
      if (
        secret.length < 32 ||
        secret.includes("dev-secret") ||
        secret.includes("change-me")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "NEXTAUTH_SECRET/AUTH_SECRET must be >=32 chars and not a dev placeholder in production",
          path: ["NEXTAUTH_SECRET"],
        });
      }
      if (!data.DATABASE_URL || data.DATABASE_URL.startsWith("file:")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "DATABASE_URL must be a Postgres connection string in production (not file:./dev.db)",
          path: ["DATABASE_URL"],
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "Invalid environment variables:",
      parsed.error.flatten().fieldErrors
    );
    throw new Error(
      "Invalid environment variables: " +
        JSON.stringify(parsed.error.flatten().fieldErrors)
    );
  }
  return parsed.data;
}

// Validate eagerly; in production throw, in dev/test allow missing but log.
let _env: Env;
try {
  _env = validateEnv();
} catch (e) {
  if (process.env.NODE_ENV === "production") {
    throw e;
  }
  console.warn(
    "[env] Validation warning (non-production, continuing):",
    (e as Error).message
  );
  _env = process.env as unknown as Env;
}

export const env: Env = _env;
