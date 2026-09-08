import { SignJWT } from 'jose'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetEnvCache } from '@/lib/config/env'
import {
  SESSION_COOKIE,
  createSessionToken,
  resetSessionKeyCache,
  verifySessionToken,
} from '@/lib/security/session'

/**
 * Session tokens.
 *
 * A session is a signed JWT, so the properties that matter are the ones that
 * decide whether a token is *refused*: a wrong signature, a wrong audience or
 * issuer, an expired or not-yet-valid token, an unexpected algorithm, and a
 * stale epoch. Every one of them must fail closed and be indistinguishable from
 * the others to the caller.
 */

const SECRET = 'unit-test-secret-value-long-enough-to-satisfy-validation-0123456789'
const OTHER_SECRET = 'a-completely-different-secret-also-long-enough-to-validate-98765'

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

function payload(overrides: Partial<Parameters<typeof createSessionToken>[0]> = {}) {
  return {
    userId: '4f1e3a7c-9b2d-4e88-8f10-6c5b2a9d7e34',
    email: 'someone@example.com',
    epoch: 1,
    ...overrides,
  }
}

afterEach(() => {
  const env = process.env as Record<string, string | undefined>
  for (const key of Object.keys(env)) {
    if (!(key in ORIGINAL_ENV)) delete env[key]
  }
  Object.assign(env, ORIGINAL_ENV)
  resetEnvCache()
  resetSessionKeyCache()
  vi.useRealTimers()
})

describe('the cookie name', () => {
  it('is namespaced, so it cannot collide with another app on the same host', () => {
    expect(SESSION_COOKIE).toBe('rolefit_session')
  })
})

describe('a token this app issued', () => {
  it('round-trips the identity it was given', async () => {
    setEnv({ AUTH_SECRET: SECRET })
    const original = payload()

    const verified = await verifySessionToken(await createSessionToken(original))

    expect(verified).toEqual(original)
  })

  it('carries no more than the three claims it needs', async () => {
    setEnv({ AUTH_SECRET: SECRET })
    const verified = await verifySessionToken(await createSessionToken(payload()))

    // A session cookie travels to the browser on every request. Anything extra
    // in it is personal data being handed out for no reason.
    expect(Object.keys(verified!).sort()).toEqual(['email', 'epoch', 'userId'])
  })

  it('is unique per issue, so two logins are not the same token', async () => {
    setEnv({ AUTH_SECRET: SECRET })
    const [first, second] = await Promise.all([
      createSessionToken(payload()),
      createSessionToken(payload()),
    ])
    // Distinct `jti`, which is what makes a future token denylist possible.
    expect(first).not.toBe(second)
  })

  it('is signed with HS256 and nothing else', async () => {
    setEnv({ AUTH_SECRET: SECRET })
    const token = await createSessionToken(payload())

    const header = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()) as {
      alg: string
      typ: string
    }
    expect(header.alg).toBe('HS256')
    expect(header.typ).toBe('JWT')
  })

  it('expires after AUTH_SESSION_TTL', async () => {
    setEnv({ AUTH_SECRET: SECRET, AUTH_SESSION_TTL: '3600' })
    const token = await createSessionToken(payload())

    expect(await verifySessionToken(token)).not.toBeNull()

    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.now() + 3601 * 1000))
    expect(await verifySessionToken(token)).toBeNull()
  })
})

describe('a token this app must refuse', () => {
  it('rejects one signed with a different secret', async () => {
    setEnv({ AUTH_SECRET: OTHER_SECRET })
    const foreign = await createSessionToken(payload())

    setEnv({ AUTH_SECRET: SECRET })
    expect(await verifySessionToken(foreign)).toBeNull()
  })

  it('rejects one whose payload was edited after signing', async () => {
    setEnv({ AUTH_SECRET: SECRET })
    const token = await createSessionToken(payload())
    const [header, body, signature] = token.split('.')

    const claims = JSON.parse(Buffer.from(body!, 'base64url').toString()) as Record<string, unknown>
    claims['sub'] = '00000000-0000-4000-8000-000000000000'
    const forged = Buffer.from(JSON.stringify(claims)).toString('base64url')

    expect(await verifySessionToken(`${header}.${forged}.${signature}`)).toBeNull()
  })

  it('rejects the alg=none downgrade', async () => {
    setEnv({ AUTH_SECRET: SECRET })
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    )}.${Buffer.from(
      JSON.stringify({ sub: 'someone', email: 'a@b.c', epoch: 1, iss: 'rolefit' }),
    ).toString('base64url')}.`

    expect(await verifySessionToken(unsigned)).toBeNull()
  })

  it('rejects a token issued for a different audience', async () => {
    setEnv({ AUTH_SECRET: SECRET })
    const key = new TextEncoder().encode(SECRET)
    const now = Math.floor(Date.now() / 1000)

    const wrongAudience = await new SignJWT({ email: 'a@b.c', epoch: 1 })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('4f1e3a7c-9b2d-4e88-8f10-6c5b2a9d7e34')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .setIssuer('rolefit')
      .setAudience('some-other-app')
      .sign(key)

    expect(await verifySessionToken(wrongAudience)).toBeNull()
  })

  it('rejects a token from a different issuer', async () => {
    setEnv({ AUTH_SECRET: SECRET })
    const key = new TextEncoder().encode(SECRET)
    const now = Math.floor(Date.now() / 1000)

    const wrongIssuer = await new SignJWT({ email: 'a@b.c', epoch: 1 })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('4f1e3a7c-9b2d-4e88-8f10-6c5b2a9d7e34')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .setIssuer('somebody-else')
      .setAudience('rolefit-app')
      .sign(key)

    expect(await verifySessionToken(wrongIssuer)).toBeNull()
  })

  it.each([
    ['a missing subject', { email: 'a@b.c', epoch: 1 }, false],
    ['an empty subject', { email: 'a@b.c', epoch: 1 }, ''],
    ['a missing email', { epoch: 1 }, true],
    ['a missing epoch', { email: 'a@b.c' }, true],
    ['an epoch that is not a number', { email: 'a@b.c', epoch: '1' }, true],
    ['an email that is not a string', { email: 42, epoch: 1 }, true],
  ] as const)('rejects a correctly signed token with %s', async (_label, claims, subject) => {
    // Signed by us, with valid issuer, audience and expiry — the only thing
    // wrong is the shape. It must still be refused, because everything
    // downstream trusts these three fields.
    setEnv({ AUTH_SECRET: SECRET })
    const key = new TextEncoder().encode(SECRET)
    const now = Math.floor(Date.now() / 1000)

    let builder = new SignJWT(claims as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .setIssuer('rolefit')
      .setAudience('rolefit-app')

    if (subject !== false) {
      builder = builder.setSubject(
        subject === true ? '4f1e3a7c-9b2d-4e88-8f10-6c5b2a9d7e34' : subject,
      )
    }

    expect(await verifySessionToken(await builder.sign(key))).toBeNull()
  })

  it.each([
    ['empty', ''],
    ['not a JWT', 'not-a-token'],
    ['two segments', 'aaa.bbb'],
    ['four segments', 'aaa.bbb.ccc.ddd'],
    ['non-base64 segments', '!!!.???.***'],
  ])('rejects a %s value without throwing', async (_label, token) => {
    setEnv({ AUTH_SECRET: SECRET })
    await expect(verifySessionToken(token)).resolves.toBeNull()
  })
})

describe('the session epoch', () => {
  it('is carried in the token so it can be checked against the database', async () => {
    // The epoch is what makes "sign out everywhere" work without a session
    // table: bumping users.session_epoch strands every outstanding token.
    setEnv({ AUTH_SECRET: SECRET })

    const issued = await verifySessionToken(await createSessionToken(payload({ epoch: 7 })))
    expect(issued?.epoch).toBe(7)
  })

  it('survives verification unchanged, so a stale one is detectable', async () => {
    setEnv({ AUTH_SECRET: SECRET })

    const before = await verifySessionToken(await createSessionToken(payload({ epoch: 1 })))
    const after = await verifySessionToken(await createSessionToken(payload({ epoch: 2 })))

    expect(before?.epoch).toBe(1)
    expect(after?.epoch).toBe(2)
  })
})
