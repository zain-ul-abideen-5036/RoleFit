import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetEnvCache } from '@/lib/config/env'
import { AppError } from '@/lib/errors'
import { assertSameOrigin } from '@/lib/security/csrf'

/**
 * CSRF origin verification.
 *
 * Two properties are tested together on purpose, because a change that fixes
 * one usually breaks the other:
 *
 *  - **Security** — a foreign origin, and a request carrying no origin at all,
 *    must be refused.
 *  - **Availability** — a legitimate deployment must accept its own origin.
 *    A check that refuses everything is not secure, it is broken; issue #21 was
 *    exactly that, and every case below marked "regression" reproduces it.
 */

const ORIGINAL_ENV = { ...process.env }

/**
 * `process.env.NODE_ENV` is typed readonly, so the object is narrowed here
 * rather than cast at each assignment.
 *
 * Resolved on every call rather than captured once: the teardown below restores
 * keys in place for exactly this reason, but a module-level reference would
 * still be the wrong object if anything ever reassigned `process.env`.
 */
function setEnv(values: Record<string, string | undefined>): void {
  const env = process.env as Record<string, string | undefined>
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
}

function setProductionEnv(overrides: Record<string, string | undefined> = {}): void {
  resetEnvCache()

  setEnv({
    NODE_ENV: 'production',
    AUTH_SECRET: 'production-secret-value-long-enough-to-validate-0123456789',
    DATABASE_URL: 'postgresql://user:pass@db.example:5432/rolefit',
    STORAGE_DRIVER: 'local',
    NEXT_PUBLIC_APP_URL: 'https://rolefit.example',
    ...overrides,
  })
}

function request(method: string, headers: Record<string, string> = {}): Request {
  return new Request('https://rolefit.example/api/auth/login', { method, headers })
}

function isAllowed(candidate: Request): boolean {
  try {
    assertSameOrigin(candidate)
    return true
  } catch {
    return false
  }
}

beforeEach(() => {
  setEnv({
    VERCEL_URL: undefined,
    VERCEL_BRANCH_URL: undefined,
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
  })
})

afterEach(() => {
  // Restore in place. Reassigning `process.env` detaches every existing
  // reference to it, including Node's own, and silently breaks later tests.
  const env = process.env as Record<string, string | undefined>
  for (const key of Object.keys(env)) {
    if (!(key in ORIGINAL_ENV)) delete env[key]
  }
  Object.assign(env, ORIGINAL_ENV)
  resetEnvCache()
})

describe('security: what must always be refused', () => {
  it('rejects a state-changing request from a foreign origin', () => {
    setProductionEnv()
    expect(isAllowed(request('POST', { origin: 'https://attacker.example' }))).toBe(false)
  })

  it('rejects a foreign origin even on a preview deployment', () => {
    setProductionEnv({ VERCEL_URL: 'rolefit-git-feat-abc.vercel.app' })
    expect(isAllowed(request('POST', { origin: 'https://attacker.example' }))).toBe(false)
  })

  it('never trusts the Host header in production', () => {
    // Host is attacker-supplied. Trusting it would defeat the entire check.
    setProductionEnv()
    expect(
      isAllowed(request('POST', { origin: 'https://attacker.example', host: 'attacker.example' })),
    ).toBe(false)
  })

  it('rejects a request carrying neither Origin nor Referer', () => {
    setProductionEnv()
    expect(isAllowed(request('POST'))).toBe(false)
  })

  it('rejects a foreign Referer when Origin is absent', () => {
    setProductionEnv()
    expect(isAllowed(request('POST', { referer: 'https://attacker.example/page' }))).toBe(false)
  })

  it('reports a rejection as FORBIDDEN without naming the expected origin', () => {
    setProductionEnv()
    const error = (() => {
      try {
        assertSameOrigin(request('POST', { origin: 'https://attacker.example' }))
        return null
      } catch (caught) {
        return caught
      }
    })()

    expect(AppError.isAppError(error)).toBe(true)
    expect((error as AppError).code).toBe('FORBIDDEN')
    expect((error as AppError).message).not.toContain('rolefit.example')
  })

  it('applies to every state-changing method', () => {
    setProductionEnv()
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(isAllowed(request(method, { origin: 'https://attacker.example' })), method).toBe(false)
    }
  })
})

describe('availability: what must always be allowed', () => {
  it('allows a safe method with no origin at all', () => {
    setProductionEnv()
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isAllowed(request(method)), method).toBe(true)
    }
  })

  it('allows the configured production origin', () => {
    setProductionEnv()
    expect(isAllowed(request('POST', { origin: 'https://rolefit.example' }))).toBe(true)
  })

  it('accepts a Referer when Origin is absent', () => {
    setProductionEnv()
    expect(isAllowed(request('POST', { referer: 'https://rolefit.example/login' }))).toBe(true)
  })

  it('regression #21: allows a Vercel preview deployment its own origin', () => {
    // A preview runs with NODE_ENV=production on a hostname nobody could have
    // configured in advance. Before the fix this returned 403 for every POST.
    setProductionEnv({ VERCEL_URL: 'rolefit-git-feat-abc123.vercel.app' })
    expect(
      isAllowed(request('POST', { origin: 'https://rolefit-git-feat-abc123.vercel.app' })),
    ).toBe(true)
  })

  it('regression #21: allows the Vercel branch alias', () => {
    setProductionEnv({ VERCEL_BRANCH_URL: 'rolefit-git-main-zain.vercel.app' })
    expect(isAllowed(request('POST', { origin: 'https://rolefit-git-main-zain.vercel.app' }))).toBe(
      true,
    )
  })

  it('regression #21: allows the Vercel production domain', () => {
    setProductionEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'rolefit.vercel.app' })
    expect(isAllowed(request('POST', { origin: 'https://rolefit.vercel.app' }))).toBe(true)
  })

  it('accepts a platform URL that already carries a scheme', () => {
    setProductionEnv({ VERCEL_URL: 'https://rolefit-abc.vercel.app' })
    expect(isAllowed(request('POST', { origin: 'https://rolefit-abc.vercel.app' }))).toBe(true)
  })

  it('trusts the Host header outside production, for tunnels and LAN addresses', () => {
    resetEnvCache()
    setEnv({
      NODE_ENV: 'development',
      AUTH_SECRET: 'development-secret-value-long-enough-to-validate-01234567',
      DATABASE_URL: 'postgresql://user:pass@localhost:5433/rolefit',
      NEXT_PUBLIC_APP_URL: undefined,
    })

    expect(
      isAllowed(
        new Request('http://192.168.1.20:3000/api/auth/login', {
          method: 'POST',
          headers: { origin: 'http://192.168.1.20:3000', host: '192.168.1.20:3000' },
        }),
      ),
    ).toBe(true)
  })
})

describe('regression #21: configuration validation', () => {
  it('refuses to start in production when NEXT_PUBLIC_APP_URL is unset', async () => {
    const { getEnv } = await import('@/lib/config/env')

    setProductionEnv({ NEXT_PUBLIC_APP_URL: undefined })

    // Previously this passed validation and then refused every request at
    // runtime. It must now fail loudly, at startup, naming the variable.
    expect(() => getEnv()).toThrowError(/NEXT_PUBLIC_APP_URL/)
  })

  it('allows a platform-provided URL to stand in for the unset variable', async () => {
    const { getEnv } = await import('@/lib/config/env')

    setProductionEnv({
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_URL: 'rolefit-git-feat-abc123.vercel.app',
    })

    expect(() => getEnv()).not.toThrow()
  })

  it('accepts an explicitly configured production URL', async () => {
    const { getEnv } = await import('@/lib/config/env')

    setProductionEnv({ NEXT_PUBLIC_APP_URL: 'https://rolefit.app' })
    expect(() => getEnv()).not.toThrow()
  })

  it('accepts a production build served on localhost, which is deliberate', async () => {
    // Verifying a production build locally, and the end-to-end suite, both do
    // this. The value is set explicitly, so it is configuration rather than an
    // oversight — and the origin check works correctly against it.
    const { getEnv } = await import('@/lib/config/env')

    setProductionEnv({ NEXT_PUBLIC_APP_URL: 'http://localhost:3100' })
    expect(() => getEnv()).not.toThrow()
  })

  it('allows a localhost production build to accept its own origin', () => {
    setProductionEnv({ NEXT_PUBLIC_APP_URL: 'http://localhost:3100' })
    expect(
      isAllowed(
        new Request('http://localhost:3100/api/auth/login', {
          method: 'POST',
          headers: { origin: 'http://localhost:3100' },
        }),
      ),
    ).toBe(true)
  })

  it('still allows localhost outside production', async () => {
    const { getEnv } = await import('@/lib/config/env')

    resetEnvCache()
    setEnv({
      NODE_ENV: 'development',
      AUTH_SECRET: 'development-secret-value-long-enough-to-validate-01234567',
      DATABASE_URL: 'postgresql://user:pass@localhost:5433/rolefit',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    })

    expect(() => getEnv()).not.toThrow()
  })
})
