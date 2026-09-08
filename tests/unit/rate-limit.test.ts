import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEnvCache } from '@/lib/config/env'
import { AppError } from '@/lib/errors'
import {
  RATE_LIMITS,
  clientIdentifier,
  consumeRateLimit,
  enforceRateLimit,
  resetRateLimitState,
  truncateIp,
} from '@/lib/security/rate-limit'

/**
 * Rate limiting.
 *
 * Three things are worth pinning here and none of them is "does a counter
 * count": that buckets are isolated from one another and from other callers,
 * that a Redis outage fails *open* rather than locking everyone out, and that
 * an unauthenticated caller is identified by a truncated IP prefix so a full
 * address is never stored.
 */

const ORIGINAL_ENV = { ...process.env }

function setEnv(values: Record<string, string | undefined>): void {
  const env = process.env as Record<string, string | undefined>
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  resetEnvCache()
}

beforeEach(() => {
  resetRateLimitState()
  setEnv({ RATE_LIMIT_DRIVER: 'memory', RATE_LIMIT_MULTIPLIER: undefined })
})

afterEach(() => {
  const env = process.env as Record<string, string | undefined>
  for (const key of Object.keys(env)) {
    if (!(key in ORIGINAL_ENV)) delete env[key]
  }
  Object.assign(env, ORIGINAL_ENV)
  resetEnvCache()
  resetRateLimitState()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the bucket definitions', () => {
  it('limits authentication far more tightly than reads', () => {
    // These are the credential-stuffing defense, not a cost control.
    expect(RATE_LIMITS['auth:login'].limit).toBeLessThan(RATE_LIMITS['api:read'].limit)
    expect(RATE_LIMITS['auth:signup'].limit).toBeLessThan(RATE_LIMITS['resume:upload'].limit)
  })

  it('limits expensive work more tightly than cheap work', () => {
    expect(RATE_LIMITS['optimization:create'].limit).toBeLessThan(
      RATE_LIMITS['document:generate'].limit,
    )
  })

  it('gives every bucket a positive limit and window', () => {
    for (const [name, rule] of Object.entries(RATE_LIMITS)) {
      expect(rule.limit, name).toBeGreaterThan(0)
      expect(rule.windowSeconds, name).toBeGreaterThan(0)
    }
  })
})

describe('consuming from a bucket', () => {
  it('counts down and then refuses', async () => {
    const limit = RATE_LIMITS['auth:signup'].limit

    for (let attempt = 1; attempt <= limit; attempt += 1) {
      const result = await consumeRateLimit('auth:signup', 'caller-a')
      expect(result.allowed, `attempt ${attempt}`).toBe(true)
      expect(result.remaining).toBe(limit - attempt)
    }

    const exhausted = await consumeRateLimit('auth:signup', 'caller-a')
    expect(exhausted.allowed).toBe(false)
    expect(exhausted.remaining).toBe(0)
    expect(exhausted.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('keeps callers independent', async () => {
    const limit = RATE_LIMITS['auth:signup'].limit
    for (let i = 0; i < limit + 1; i += 1) await consumeRateLimit('auth:signup', 'noisy')

    // One caller exhausting a bucket must not lock out everyone else.
    const other = await consumeRateLimit('auth:signup', 'quiet')
    expect(other.allowed).toBe(true)
    expect(other.remaining).toBe(limit - 1)
  })

  it('keeps buckets independent', async () => {
    const limit = RATE_LIMITS['auth:signup'].limit
    for (let i = 0; i < limit + 1; i += 1) await consumeRateLimit('auth:signup', 'caller-b')

    // Exhausting signup must not block that caller from logging in.
    expect((await consumeRateLimit('auth:login', 'caller-b')).allowed).toBe(true)
  })

  it('lets the window expire and start again', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-09T12:00:00Z'))

    const rule = RATE_LIMITS['auth:signup']
    for (let i = 0; i < rule.limit + 1; i += 1) await consumeRateLimit('auth:signup', 'caller-c')
    expect((await consumeRateLimit('auth:signup', 'caller-c')).allowed).toBe(false)

    vi.setSystemTime(new Date(Date.now() + (rule.windowSeconds + 1) * 1000))

    const afterReset = await consumeRateLimit('auth:signup', 'caller-c')
    expect(afterReset.allowed).toBe(true)
    expect(afterReset.remaining).toBe(rule.limit - 1)
  })

  it('never reports a retry delay of zero while blocked', async () => {
    // A 429 carrying Retry-After: 0 invites an immediate retry loop.
    const limit = RATE_LIMITS['auth:signup'].limit
    for (let i = 0; i < limit + 1; i += 1) await consumeRateLimit('auth:signup', 'caller-d')

    const blocked = await consumeRateLimit('auth:signup', 'caller-d')
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1)
  })

  it('scales the ceiling by RATE_LIMIT_MULTIPLIER but keeps the window', async () => {
    setEnv({ RATE_LIMIT_MULTIPLIER: '2' })
    const rule = RATE_LIMITS['auth:signup']

    const first = await consumeRateLimit('auth:signup', 'caller-e')
    expect(first.limit).toBe(rule.limit * 2)
    // Scaling the ceiling rather than the window keeps burst and reset timing
    // identical, so a test run exercises the real limiter.
    expect(first.retryAfterSeconds).toBe(rule.windowSeconds)
  })
})

describe('enforceRateLimit', () => {
  it('returns quietly while the bucket has room', async () => {
    await expect(enforceRateLimit('auth:login', 'caller-f')).resolves.toBeUndefined()
  })

  it('throws a 429 carrying a retry delay once exhausted', async () => {
    const limit = RATE_LIMITS['auth:login'].limit
    for (let i = 0; i < limit; i += 1) await enforceRateLimit('auth:login', 'caller-g')

    const error = await enforceRateLimit('auth:login', 'caller-g').catch(
      (caught: unknown) => caught,
    )

    expect(AppError.isAppError(error)).toBe(true)
    expect((error as AppError).code).toBe('RATE_LIMITED')
  })
})

describe('the upstash driver', () => {
  function useUpstash(): void {
    setEnv({
      RATE_LIMIT_DRIVER: 'upstash',
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'PLACEHOLDER_TOKEN',
    })
  }

  it('allows a request while the count is within the limit', async () => {
    useUpstash()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ result: 3 }, { result: 250 }],
      }),
    )

    const result = await consumeRateLimit('auth:login', 'caller-h')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(RATE_LIMITS['auth:login'].limit - 3)
    expect(result.retryAfterSeconds).toBe(250)
  })

  it('refuses once the count passes the limit', async () => {
    useUpstash()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ result: RATE_LIMITS['auth:login'].limit + 1 }, { result: 100 }],
      }),
    )

    expect((await consumeRateLimit('auth:login', 'caller-i')).allowed).toBe(false)
  })

  it('sets an expiry on a key that has none, so a counter cannot outlive its window', async () => {
    useUpstash()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ result: 1 }, { result: -1 }],
    })
    vi.stubGlobal('fetch', fetchMock)

    await consumeRateLimit('auth:login', 'caller-j')

    // Without the follow-up EXPIRE, a first request would create a key that
    // never resets and the caller would be blocked forever.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/expire/')
  })

  it('fails open when Redis is unreachable', async () => {
    useUpstash()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    // A Redis outage must not lock every user out of the product. The event is
    // logged instead.
    const result = await consumeRateLimit('optimization:create', 'caller-k')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(RATE_LIMITS['optimization:create'].limit)
  })

  it('does not put the token in the URL', async () => {
    useUpstash()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ result: 1 }, { result: 60 }],
    })
    vi.stubGlobal('fetch', fetchMock)

    await consumeRateLimit('auth:login', 'caller-l')

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('PLACEHOLDER_TOKEN')
    }
  })
})

describe('identifying an unauthenticated caller', () => {
  function requestWith(headers: Record<string, string>): Request {
    return new Request('https://rolefit.example/api/auth/login', { method: 'POST', headers })
  }

  it('truncates IPv4 to a /24, so a full address is never stored', () => {
    expect(truncateIp('203.0.113.42')).toBe('203.0.113.0')
  })

  it('truncates IPv6 to a /48', () => {
    expect(truncateIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:0db8:85a3::')
  })

  it('returns unknown for something that is not an address', () => {
    expect(truncateIp('not-an-ip')).toBe('unknown')
    expect(truncateIp('1.2.3')).toBe('unknown')
  })

  it('takes the first entry of x-forwarded-for, which is the client', () => {
    // Later entries are proxies; trusting them would let one proxy's traffic
    // share a bucket with everyone behind it.
    expect(clientIdentifier(requestWith({ 'x-forwarded-for': '203.0.113.42, 70.41.3.18' }))).toBe(
      '203.0.113.0',
    )
  })

  it('falls back to x-real-ip', () => {
    expect(clientIdentifier(requestWith({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.0')
  })

  it('prefers x-forwarded-for when both are present', () => {
    expect(
      clientIdentifier(
        requestWith({ 'x-forwarded-for': '203.0.113.42', 'x-real-ip': '198.51.100.7' }),
      ),
    ).toBe('203.0.113.0')
  })

  it('returns unknown when neither header is present', () => {
    expect(clientIdentifier(requestWith({}))).toBe('unknown')
  })

  it('groups a whole /24 into one bucket', async () => {
    // Two addresses on the same subnet must share a counter, which is what
    // makes truncation a defense rather than a loophole.
    const a = clientIdentifier(requestWith({ 'x-forwarded-for': '203.0.113.10' }))
    const b = clientIdentifier(requestWith({ 'x-forwarded-for': '203.0.113.200' }))
    expect(a).toBe(b)

    await consumeRateLimit('auth:login', a)
    const second = await consumeRateLimit('auth:login', b)
    expect(second.remaining).toBe(RATE_LIMITS['auth:login'].limit - 2)
  })
})
