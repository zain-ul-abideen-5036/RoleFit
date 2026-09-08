import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEnvCache } from '@/lib/config/env'

/**
 * The session cookie.
 *
 * Its attributes *are* the security model: `httpOnly` keeps it away from
 * injected script, `SameSite=Lax` stops it being sent on a cross-site POST
 * (which is half the CSRF defense, the other half being the origin check), and
 * `Secure` keeps it off plain HTTP.
 *
 * None of that is visible in the JWT tests, because none of it is in the token
 * — it is in the `Set-Cookie` attributes, which is what this file asserts.
 */

interface CookieCall {
  name: string
  value: string
  options: {
    httpOnly?: boolean
    sameSite?: string
    secure?: boolean
    path?: string
    maxAge?: number
  }
}

const calls: CookieCall[] = []
const jar = new Map<string, string>()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.get(name)
      return value === undefined ? undefined : { name, value }
    },
    set: (name: string, value: string, options: CookieCall['options'] = {}) => {
      calls.push({ name, value, options })
      if (value === '') jar.delete(name)
      else jar.set(name, value)
    },
  }),
  headers: async () => new Headers(),
}))

const {
  SESSION_COOKIE,
  clearSessionCookie,
  createSessionToken,
  getSessionFromCookies,
  readSessionCookie,
  resetSessionKeyCache,
  setSessionCookie,
} = await import('@/lib/security/session')

const SECRET = 'unit-test-secret-value-long-enough-to-satisfy-validation-0123456789'
const ORIGINAL_ENV = { ...process.env }

function setEnv(values: Record<string, string | undefined>): void {
  const env = process.env as Record<string, string | undefined>
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  resetEnvCache()
  resetSessionKeyCache()
}

function lastCall(): CookieCall {
  const call = calls.at(-1)
  expect(call, 'no cookie was set').toBeDefined()
  return call!
}

beforeEach(() => {
  calls.length = 0
  jar.clear()
  setEnv({ AUTH_SECRET: SECRET })
})

afterEach(() => {
  const env = process.env as Record<string, string | undefined>
  for (const key of Object.keys(env)) {
    if (!(key in ORIGINAL_ENV)) delete env[key]
  }
  Object.assign(env, ORIGINAL_ENV)
  resetEnvCache()
  resetSessionKeyCache()
})

describe('setting the session cookie', () => {
  it('is httpOnly, so injected script cannot read it', async () => {
    await setSessionCookie('a-token')
    expect(lastCall().options.httpOnly).toBe(true)
  })

  it('is SameSite=Lax, not Strict', async () => {
    // Lax so following a link in from an email keeps the user signed in, while
    // still refusing to send the cookie on a cross-site POST.
    await setSessionCookie('a-token')
    expect(lastCall().options.sameSite).toBe('lax')
  })

  it('is scoped to the whole site', async () => {
    await setSessionCookie('a-token')
    expect(lastCall().options.path).toBe('/')
  })

  it('expires with the session TTL rather than on browser close', async () => {
    setEnv({ AUTH_SECRET: SECRET, AUTH_SESSION_TTL: '3600' })

    await setSessionCookie('a-token')
    expect(lastCall().options.maxAge).toBe(3600)
  })

  it('is Secure in production', async () => {
    setEnv({
      AUTH_SECRET: SECRET,
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://rolefit.example',
      DATABASE_URL: 'postgresql://user:pass@db.example:5432/rolefit',
    })

    await setSessionCookie('a-token')
    expect(lastCall().options.secure).toBe(true)
  })

  it('is not Secure outside production, so localhost over HTTP works', async () => {
    setEnv({ AUTH_SECRET: SECRET, NODE_ENV: 'development' })

    await setSessionCookie('a-token')
    expect(lastCall().options.secure).toBe(false)
  })

  it('stores the token under the namespaced name', async () => {
    await setSessionCookie('a-token')

    expect(lastCall().name).toBe(SESSION_COOKIE)
    expect(lastCall().value).toBe('a-token')
  })
})

describe('clearing the session cookie', () => {
  it('overwrites the value and expires it immediately', async () => {
    await setSessionCookie('a-token')
    await clearSessionCookie()

    const call = lastCall()
    expect(call.value).toBe('')
    // maxAge 0 rather than omitting the cookie: the browser must be told to
    // drop what it already has.
    expect(call.options.maxAge).toBe(0)
  })

  it('keeps the same attributes, so the browser matches and replaces the cookie', async () => {
    await clearSessionCookie()

    const call = lastCall()
    expect(call.options.httpOnly).toBe(true)
    expect(call.options.sameSite).toBe('lax')
    expect(call.options.path).toBe('/')
  })

  it('leaves nothing readable afterwards', async () => {
    await setSessionCookie('a-token')
    expect(await readSessionCookie()).toBe('a-token')

    await clearSessionCookie()
    expect(await readSessionCookie()).toBeNull()
  })
})

describe('reading the session cookie', () => {
  it('returns null when absent rather than an empty string', async () => {
    // An empty string is truthy-adjacent enough to cause a caller to attempt
    // verification on nothing.
    expect(await readSessionCookie()).toBeNull()
  })

  it('returns the stored token', async () => {
    await setSessionCookie('a-token')
    expect(await readSessionCookie()).toBe('a-token')
  })
})

describe('getSessionFromCookies', () => {
  it('returns the payload for a valid token', async () => {
    const payload = {
      userId: '4f1e3a7c-9b2d-4e88-8f10-6c5b2a9d7e34',
      email: 'someone@example.com',
      epoch: 3,
    }

    await setSessionCookie(await createSessionToken(payload))

    expect(await getSessionFromCookies()).toEqual(payload)
  })

  it('returns null when there is no cookie at all', async () => {
    expect(await getSessionFromCookies()).toBeNull()
  })

  it('returns null for a cookie holding something that is not a token', async () => {
    await setSessionCookie('not-a-jwt')
    expect(await getSessionFromCookies()).toBeNull()
  })

  it('returns null for a token signed with a different secret', async () => {
    const foreign = await createSessionToken({
      userId: '4f1e3a7c-9b2d-4e88-8f10-6c5b2a9d7e34',
      email: 'someone@example.com',
      epoch: 1,
    })
    await setSessionCookie(foreign)

    setEnv({ AUTH_SECRET: 'a-completely-different-secret-also-long-enough-to-validate-98765' })

    // Rotating AUTH_SECRET is the emergency lever: every outstanding cookie
    // stops resolving to a session.
    expect(await getSessionFromCookies()).toBeNull()
  })

  it('does not throw on a malformed cookie, so a stale one is not a 500', async () => {
    await setSessionCookie('aaa.bbb.ccc')
    await expect(getSessionFromCookies()).resolves.toBeNull()
  })
})
