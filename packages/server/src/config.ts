/**
 * Validates and exports typed configuration from environment variables.
 * Uses zod for schema validation and dotenv for .env file loading.
 * Fails fast on startup with all errors printed at once.
 */
import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load .env from repo root (two levels up from packages/server/)
dotenv.config({ path: resolve(import.meta.dirname, "../../../.env") });

export const configSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Server
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Auth
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_REDIRECT_URI: z.string().url().default("http://localhost:3000/api/auth/google/callback"),

  // Cron (optional — for Vercel cron endpoint auth)
  CRON_SECRET: z.string().optional(),

  // AWS Bedrock (optional — for AI classification via Claude on Bedrock)
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),

  // AimFox (optional — for LinkedIn automation integration)
  AIMFOX_API_KEY: z.string().optional(),
  AIMFOX_WEBHOOK_SECRET: z.string().optional(),
  AIMFOX_ACCOUNT_ID: z.string().default("27947204"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid configuration:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}
