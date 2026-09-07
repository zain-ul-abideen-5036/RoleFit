import 'server-only'

import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { cookies } from 'next/headers'

import { getEnv } from '@/lib/config/env'
import { logger } from '@/lib/logger'

/**
 * Session management.
 *
 * Sessions are signed JWTs in an httpOnly, SameSite=Lax cookie. `Lax` (rather
 * than `Strict`) so that following a link into the app from an email keeps the
 * user signed in, while still refusing to send the cookie on cross-site POSTs —
 * which, combined with the origin check in `csrf.ts`, is the CSRF defense.
 *
 * The token carries a session epoch. Bumping `users.session_epoch` invalidates
 * every outstanding token for that user, which is what makes "sign out
 * everywhere" and post-password-change invalidation work without a session
 * table.
 */

export const SESSION_COOKIE = 'rolefit_session'
const ISSUER = 'rolefit'
const AUDIENCE = 'rolefit-app'

export interface SessionPayload {
  userId: string
  email: string
  /** Must match the user's current `session_epoch` to be accepted. */
  epoch: number
}

let cachedKey: Uint8Array | null = null

function secretKey(): Uint8Array {
  if (!cachedKey) cachedKey = new TextEncoder().encode(getEnv().AUTH_SECRET)
  return cachedKey
}

/** Test-only: clears the derived key after the secret changes. */
export function resetSessionKeyCache(): void {
  cachedKey = null
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const env = getEnv()
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({ email: payload.email, epoch: payload.epoch })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.userId)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + env.AUTH_SESSION_TTL)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(crypto.randomUUID())
    .sign(secretKey())
}

/**
 * Verifies a token's signature and claims.
 * Returns null on any failure — expired, tampered, wrong audience, malformed.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    })

    return toSessionPayload(payload)
  } catch {
    // Never log the token, and never distinguish failure modes to the caller:
    // "expired" and "forged" must be indistinguishable from outside.
    return null
  }
}

function toSessionPayload(payload: JWTPayload): SessionPayload | null {
  const userId = payload.sub
  const email = payload['email']
  const epoch = payload['epoch']

  if (typeof userId !== 'string' || userId.length === 0) return null
  if (typeof email !== 'string') return null
  if (typeof epoch !== 'number') return null

  return { userId, email, epoch }
}

/* ==========================================================================
   Cookie helpers
   ========================================================================== */

export async function setSessionCookie(token: string): Promise<void> {
  const env = getEnv()
  const store = await cookies()

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure in production; localhost is served over plain HTTP in development.
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: env.AUTH_SESSION_TTL,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: getEnv().NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value ?? null
}

/** Reads and verifies the current request's session, if any. */
export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const token = await readSessionCookie()
  if (!token) return null

  const payload = await verifySessionToken(token)
  if (!payload) {
    logger.debug('session.invalid_token_presented')
    return null
  }
  return payload
}
