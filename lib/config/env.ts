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

/**
 * Configuration problems that are not fatal but should be seen.
 *
 * Collected during parsing and emitted once, after validation succeeds — a
 * warning raised inside `superRefine` would be lost if a later issue aborted
 * the parse.
 */
const warnings: string[] = []

/**
 * Whether the process runs on a platform with an ephemeral filesystem.
 *
 * Detected rather than assumed, so a self-hosted production deployment (or an
 * end-to-end run against a production build) is not held to a constraint that
 * does not apply to it.
 */
function isServerlessPlatform(): boolean {
  return Boolean(
    process.env.VERCEL ??
    process.env.AWS_LAMBDA_FUNCTION_NAME ??
    process.env.NETLIFY ??
    process.env.CF_PAGES,
  )
}

/**
 * The region embedded in an S3-compatible endpoint hostname, if it has one.
 *
 * Backblaze B2 (`s3.us-west-004.backblazeb2.com`) and AWS S3
 * (`s3.eu-central-1.amazonaws.com`) both name their region in the host.
 * Cloudflare R2 and MinIO do not, and return `null` here rather than a guess.
 *
 * The segment must look like a region — two or more letters, a word, a number
 * — so `s3.amazonaws.com` does not yield a "region" of `amazonaws`.
 */
function regionFromEndpoint(endpoint: string | undefined): string | null {
  if (!endpoint) return null

  let host: string
  try {
    host = new URL(endpoint.includes('://') ? endpoint : `https://${endpoint}`).hostname
  } catch {
    return null
  }

  return /^s3\.([a-z]{2,}-[a-z]+-\d{1,3})\./.exec(host)?.[1] ?? null
}

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
    /**
     * Scales every rate-limit bucket. Exists so load tests and end-to-end runs
     * can exercise the real limiter rather than bypassing it. Leave at 1 in
     * production: raising it weakens abuse protection across the board.
     */
    RATE_LIMIT_MULTIPLIER: z.coerce.number().min(1).max(100).default(1),
    UPSTASH_REDIS_REST_URL: z.string().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    /**
     * Transactional email, for verification and password reset.
     *
     * `none` is the default and disables both flows: the app stays fully
     * usable and the UI stops offering them, rather than showing a reset link
     * that silently does nothing.
     */
    EMAIL_PROVIDER: z.enum(['none', 'console', 'resend']).default('none'),
    EMAIL_API_KEY: z.string().optional(),
    /** Sender address. Must be on a domain verified with the provider. */
    EMAIL_FROM: z.string().optional(),

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
      for (const key of ['STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER is "s3"`,
          })
        }
      }

      // Checked against the raw variable rather than the parsed value, because
      // this field is defaulted: a `!value.STORAGE_BUCKET` test can never fire,
      // so forgetting it silently addressed a bucket named after the default.
      // Bucket names are per-account at best and globally unique on Backblaze
      // B2, so no default can be right for someone else's account.
      if (!process.env.STORAGE_BUCKET?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_BUCKET'],
          message:
            'STORAGE_BUCKET must be set explicitly when STORAGE_DRIVER is "s3". Bucket names are globally unique on Backblaze B2, so the built-in default will not be your bucket.',
        })
      }

      // The region is part of the SigV4 signature, so a wrong one is not a
      // routing mistake that fails loudly — it is a signature mismatch that
      // surfaces as an opaque 403 on the first upload, long after startup.
      // `auto` is correct for Cloudflare R2 and wrong everywhere else, so a
      // default cannot be right for every provider: require it explicitly.
      if (!process.env.STORAGE_REGION?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_REGION'],
          message:
            'STORAGE_REGION must be set explicitly when STORAGE_DRIVER is "s3". It is part of the request signature, so a wrong value fails as an opaque 403 on the first upload rather than at startup. Backblaze B2: the region inside your endpoint, e.g. "us-west-004". AWS S3: the bucket region, e.g. "eu-central-1". Cloudflare R2: "auto".',
        })
      }

      // Many S3-compatible endpoints carry their region in the hostname, which
      // makes a mismatch checkable rather than merely documented. Endpoints
      // that do not (R2, MinIO) simply skip this.
      const endpointRegion = regionFromEndpoint(value.STORAGE_ENDPOINT)
      if (endpointRegion && endpointRegion !== value.STORAGE_REGION) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_REGION'],
          message: `STORAGE_REGION is "${value.STORAGE_REGION}" but STORAGE_ENDPOINT points at region "${endpointRegion}". They must match, because the endpoint decides where the request goes and the region decides how it is signed.`,
        })
      }
    }

    if (value.EMAIL_PROVIDER === 'resend') {
      for (const key of ['EMAIL_API_KEY', 'EMAIL_FROM'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when EMAIL_PROVIDER is "resend"`,
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

      // NEXT_PUBLIC_APP_URL falls back to a localhost default, which is right
      // for development and catastrophic in production: it becomes the only
      // origin the CSRF check accepts, so every sign-in, upload and export is
      // refused. The failure is silent at startup and total at runtime.
      //
      // The test is whether the variable was *set*, not whether it looks like
      // localhost — serving a production build on localhost is a legitimate
      // thing to do (local verification, the end-to-end suite), and there the
      // value is deliberate and correct. A platform-provided deployment URL
      // also counts as configured, since a preview deployment has no fixed
      // hostname anyone could have set in advance.
      const wasExplicitlySet = Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim())
      const hasPlatformUrl = Boolean(
        process.env.VERCEL_URL ??
        process.env.VERCEL_PROJECT_PRODUCTION_URL ??
        process.env.VERCEL_BRANCH_URL,
      )

      if (!wasExplicitlySet && !hasPlatformUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['NEXT_PUBLIC_APP_URL'],
          message:
            'NEXT_PUBLIC_APP_URL must be set to the public origin in production (for example https://rolefit.app). Unset, it falls back to localhost and the CSRF origin check then rejects every sign-in, upload and export.',
        })
      }

      // The console transport prints verification and reset links to stderr.
      // Those links are credentials, so this is a development affordance only.
      // Refused rather than warned about: a warning in a log nobody reads is
      // not a control, and the failure mode is account takeover from a log.
      if (value.EMAIL_PROVIDER === 'console') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_PROVIDER'],
          message:
            'EMAIL_PROVIDER=console writes password reset links to stderr and cannot be used in production. Set EMAIL_PROVIDER=resend, or none to disable the email flows.',
        })
      }

      // The local storage driver writes to the filesystem, which is ephemeral
      // on serverless platforms — a generated document would vanish between
      // invocations. That is fatal there, but perfectly workable for a
      // self-hosted deployment, a container with a volume, or an end-to-end
      // run against a production build. So this fails only where it is
      // genuinely broken, and warns everywhere else rather than refusing to
      // start.
      if (value.STORAGE_DRIVER === 'local') {
        if (isServerlessPlatform()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['STORAGE_DRIVER'],
            message:
              'STORAGE_DRIVER=local cannot be used on serverless hosting: the filesystem does not persist between invocations. Set STORAGE_DRIVER=s3.',
          })
        } else {
          warnings.push(
            'STORAGE_DRIVER=local in production. Generated documents are stored on the local filesystem and will be lost if it is not persistent.',
          )
        }
      }

      if (value.RATE_LIMIT_MULTIPLIER > 1) {
        warnings.push(
          `RATE_LIMIT_MULTIPLIER=${value.RATE_LIMIT_MULTIPLIER} in production. Every rate limit is ${value.RATE_LIMIT_MULTIPLIER}x its intended value.`,
        )
      }

      if (value.RATE_LIMIT_DRIVER === 'memory') {
        warnings.push(
          'RATE_LIMIT_DRIVER=memory in production. Limits are per-instance and will not hold across a horizontally scaled deployment. Set RATE_LIMIT_DRIVER=upstash.',
        )
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

  warnings.length = 0
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${details}`)
  }

  for (const warning of warnings) {
    // Written directly rather than through the logger: the logger reads
    // configuration, and this runs while configuration is still being resolved.
    process.stderr.write(`[rolefit] configuration warning: ${warning}\n`)
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
