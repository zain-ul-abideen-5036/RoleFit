import 'server-only'

import { z } from 'zod'

/**
 * Server-side environment configuration.
 *
 * Parsed once, lazily, and cached. Importing this module from client code is a
 * build error (`server-only`) — that is the guard that keeps `AI_API_KEY` and
 * storage credentials out of the browser bundle.
 */

const booleanish = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1')

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    AUTH_SESSION_TTL: z.coerce
      .number()
      .int()
      .min(300)
      .default(60 * 60 * 24 * 7),

    AI_PROVIDER: z.enum(['deterministic', 'anthropic', 'openai']).default('deterministic'),
    AI_API_KEY: z.string().optional(),
    AI_MODEL: z.string().optional(),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(45_000),
    AI_MAX_REPAIR_ATTEMPTS: z.coerce.number().int().min(0).max(5).default(2),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_ENDPOINT: z.string().optional(),
    STORAGE_REGION: z.string().default('auto'),
    STORAGE_ACCESS_KEY: z.string().optional(),
    STORAGE_SECRET_KEY: z.string().optional(),
    STORAGE_BUCKET: z.string().default('rolefit-documents'),
    STORAGE_FORCE_PATH_STYLE: booleanish.default('true'),
    STORAGE_SIGNED_URL_TTL: z.coerce.number().int().min(30).max(3600).default(300),

    RATE_LIMIT_DRIVER: z.enum(['memory', 'upstash']).default('memory'),
    UPSTASH_REDIS_REST_URL: z.string().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    ANALYTICS_PROVIDER: z.enum(['none', 'console', 'posthog']).default('none'),
    ANALYTICS_KEY: z.string().optional(),
    ANALYTICS_HOST: z.string().optional(),

    MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).default(4_500_000),

    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((value, ctx) => {
    if (value.AI_PROVIDER !== 'deterministic' && !value.AI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_API_KEY'],
        message: `AI_API_KEY is required when AI_PROVIDER is "${value.AI_PROVIDER}"`,
      })
    }

    if (value.STORAGE_DRIVER === 's3') {
      for (const key of ['STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY', 'STORAGE_BUCKET'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER is "s3"`,
          })
        }
      }
    }

    if (value.RATE_LIMIT_DRIVER === 'upstash') {
      for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when RATE_LIMIT_DRIVER is "upstash"`,
          })
        }
      }
    }

    if (value.NODE_ENV === 'production') {
      if (value.AUTH_SECRET.startsWith('replace-me')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_SECRET'],
          message: 'AUTH_SECRET still holds the placeholder value from .env.example',
        })
      }
      if (value.STORAGE_DRIVER === 'local') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_DRIVER'],
          message:
            'STORAGE_DRIVER=local is not durable on serverless hosting. Use "s3" in production.',
        })
      }
    }
  })

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

/**
 * Reads and validates the environment. Throws a single aggregated error listing
 * every invalid key, so a misconfigured deployment fails fast and legibly
 * instead of erroring deep inside a request handler.
 */
export function getEnv(): Env {
  if (cached) return cached

  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${details}`)
  }

  cached = parsed.data
  return cached
}

/** Test-only escape hatch so suites can swap configuration between cases. */
export function resetEnvCache(): void {
  cached = null
}

export const isProduction = (): boolean => getEnv().NODE_ENV === 'production'
export const isDevelopment = (): boolean => getEnv().NODE_ENV === 'development'
