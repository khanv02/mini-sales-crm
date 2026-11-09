import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const booleanFromEnv = z
  .preprocess((value) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === '') {
        return false;
      }
    }
    return value;
  }, z.boolean())
  .default(false);

const encryptionKeySchema = z.string().refine((value) => {
  try {
    const isHex = /^[0-9a-fA-F]{64}$/.test(value);
    const decoded = Buffer.from(value, isHex ? 'hex' : 'base64');
    return decoded.length === 32;
  } catch {
    return false;
  }
}, 'must decode to exactly 32 bytes (hex or base64)');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.string().trim().min(1).default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_VERSION: z.string().trim().min(1).default('0.1.0'),

  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => /^postgres(ql)?:\/\//.test(value), 'must be a PostgreSQL connection string'),
  REDIS_URL: z
    .string()
    .min(1)
    .refine((value) => /^rediss?:\/\//.test(value), 'must be a Redis connection string'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().regex(/^\d+[smhd]$/, 'must look like 15m, 1h or 7d'),
  JWT_REFRESH_TTL: z.string().regex(/^\d+[smhd]$/, 'must look like 15m, 1h or 7d'),
  JWT_REFRESH_PEPPER: z.string().min(32),
  WEBHOOK_SECRET_ENC_KEY: encryptionKeySchema,

  MAIL_HOST: z.string().trim().min(1).default('localhost'),
  MAIL_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  MAIL_FROM: z.string().trim().min(1),

  SENTRY_DSN: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined))
    .refine((value) => value === undefined || /^https?:\/\//.test(value), 'must be an HTTP(S) URL'),

  AI_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  AI_MODEL: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  AI_ORG_DAILY_TOKEN_LIMIT: z.coerce.number().int().nonnegative().default(200_000),
  AI_USER_DAILY_TOKEN_LIMIT: z.coerce.number().int().nonnegative().default(50_000),

  ALLOW_SEED: booleanFromEnv,
  SEED_PERF: booleanFromEnv,
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'EnvValidationError';
    Object.setPrototypeOf(this, EnvValidationError.prototype);
  }
}

export function formatEnvIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`);
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = formatEnvIssues(parsed.error);
    throw new EnvValidationError(
      `Invalid environment configuration (${issues.length} problem(s)):\n- ${issues.join('\n- ')}`,
      issues,
    );
  }
  return parsed.data;
}

/**
 * Load the nearest `.env` walking up from the working directory.
 * Existing process variables always win, so CI/test overrides are kept.
 */
export function loadEnvFile(startDir: string = process.cwd()): string | undefined {
  let current = resolve(startDir);
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(current, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return undefined;
}
