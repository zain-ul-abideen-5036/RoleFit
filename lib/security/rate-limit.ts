import 'server-only'

import { getEnv } from '@/lib/config/env'
import { errors } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Rate limiting.
 *
 * Two drivers. `memory` is per-instance and therefore only meaningful for local
 * development and single-instance deployments — it is documented as such in
 * `.env.example` rather than being presented as production protection, because
 * a serverless deployment scaled to N instances effectively multiplies every
 * limit by N. `upstash` uses a shared Redis and is the production driver.
 *
 * Limits are expressed per named bucket so an expensive operation (running an
 * optimization) can be limited far more tightly than a cheap one (reading a
 * dashboard).
 */

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
}

/**
 * Named buckets. Authentication limits are deliberately strict — they are the
 * defense against credential stuffing, not merely a cost control.
 */
export const RATE_LIMITS = {
  'auth:login': { limit: 8, windowSeconds: 600 },
  'auth:signup': { limit: 5, windowSeconds: 3600 },
  'resume:upload': { limit: 20, windowSeconds: 3600 },
  'analysis:create': { limit: 30, windowSeconds: 3600 },
  'optimization:create': { limit: 20, windowSeconds: 3600 },
  'document:generate': { limit: 60, windowSeconds: 3600 },
  'api:read': { limit: 300, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitBucket = keyof typeof RATE_LIMITS

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Seconds until the window resets. */
  retryAfterSeconds: number
  limit: number
}

/* ==========================================================================
   Memory driver
   ========================================================================== */

interface Counter {
  count: number
  resetAt: number
}

const memoryStore = new Map<string, Counter>()
/** Bounds memory use if a burst of unique keys arrives. */
const MAX_MEMORY_KEYS = 20_000

function sweepExpired(now: number): void {
  for (const [key, counter] of memoryStore) {
    if (counter.resetAt <= now) memoryStore.delete(key)
  }
}

function memoryConsume(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now()
  const existing = memoryStore.get(key)

  if (!existing || existing.resetAt <= now) {
    if (memoryStore.size >= MAX_MEMORY_KEYS) sweepExpired(now)
    memoryStore.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 })
    return {
      allowed: true,
      remaining: rule.limit - 1,
      retryAfterSeconds: rule.windowSeconds,
      limit: rule.limit,
    }
  }

  existing.count += 1
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))

  return {
    allowed: existing.count <= rule.limit,
    remaining: Math.max(0, rule.limit - existing.count),
    retryAfterSeconds,
    limit: rule.limit,
  }
}

/** Test-only: clears in-memory counters between cases. */
export function resetRateLimitState(): void {
  memoryStore.clear()
}

/* ==========================================================================
   Upstash driver
   ========================================================================== */

/**
 * Fixed-window counter in Redis, via the REST API.
 *
 * INCR then EXPIRE-on-first-hit. A sliding window would be smoother but needs
 * either a sorted set per key or a Lua script; a fixed window is sufficient for
 * abuse prevention and costs one round trip.
 */
async function upstashConsume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const env = getEnv()
  const base = env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, '')
  const headers = { authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN!}` }

  const response = await fetch(`${base}/pipeline`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify([
      ['INCR', key],
      ['TTL', key],
    ]),
    cache: 'no-store',
  })

  if (!response.ok) {
    // Failing open is the right trade-off here: a Redis outage must not lock
    // every user out of the product. The event is logged so it is visible.
    logger.error('rate_limit.upstash_unavailable', { status: response.status })
    return {
      allowed: true,
      remaining: rule.limit,
      retryAfterSeconds: 0,
      limit: rule.limit,
    }
  }

  const body = (await response.json()) as Array<{ result: number }>
  const count = body[0]?.result ?? 1
  const ttl = body[1]?.result ?? -1

  if (ttl < 0) {
    await fetch(`${base}/expire/${encodeURIComponent(key)}/${rule.windowSeconds}`, {
      method: 'POST',
      headers,
      cache: 'no-store',
    }).catch(() => undefined)
  }

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: ttl > 0 ? ttl : rule.windowSeconds,
    limit: rule.limit,
  }
}

/* ==========================================================================
   Public API
   ========================================================================== */

/**
 * Consumes one unit from a bucket.
 *
 * `identifier` should be a user id where the caller is authenticated, and a
 * truncated IP prefix otherwise — see `clientIdentifier`.
 */
export async function consumeRateLimit(
  bucket: RateLimitBucket,
  identifier: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[bucket]
  const key = `rolefit:rl:${bucket}:${identifier}`

  return getEnv().RATE_LIMIT_DRIVER === 'upstash'
    ? upstashConsume(key, rule)
    : memoryConsume(key, rule)
}

/** Consumes one unit and throws a 429 when the bucket is exhausted. */
export async function enforceRateLimit(bucket: RateLimitBucket, identifier: string): Promise<void> {
  const result = await consumeRateLimit(bucket, identifier)
  if (result.allowed) return

  logger.warn('rate_limit.exceeded', { bucket })
  throw errors.rateLimited(result.retryAfterSeconds)
}

/**
 * A stable identifier for an unauthenticated caller.
 *
 * The IP is truncated to a /24 (IPv4) or /48 (IPv6) prefix before use, so the
 * rate limiter never stores a full address. That keeps abuse prevention working
 * while limiting what is retained about people who never signed up.
 */
export function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const real = request.headers.get('x-real-ip')
  const raw = (forwarded?.split(',')[0] ?? real ?? '').trim()

  if (!raw) return 'unknown'
  return truncateIp(raw)
}

export function truncateIp(ip: string): string {
  if (ip.includes(':')) {
    // IPv6: keep the first three hextets (/48).
    const parts = ip.split(':').filter(Boolean)
    return `${parts.slice(0, 3).join(':')}::`
  }

  const octets = ip.split('.')
  if (octets.length !== 4) return 'unknown'
  return `${octets[0]}.${octets[1]}.${octets[2]}.0`
}
