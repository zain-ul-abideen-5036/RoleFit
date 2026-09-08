import 'server-only'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Single-use tokens for email verification and password reset.
 *
 * A token is a random secret that travels in an email and is stored only as a
 * digest. That asymmetry is the whole design: possession of the database does
 * not confer the ability to redeem anything.
 *
 * SHA-256 rather than bcrypt, deliberately. Password hashing is slow to make
 * guessing a low-entropy secret expensive. These secrets carry 256 bits of
 * entropy from a CSPRNG, so there is nothing to guess and no reason to pay
 * bcrypt's cost on a link click — a fast digest of a high-entropy secret is
 * the right trade, where a fast digest of a password would not be.
 */

/** 32 bytes, base64url — 256 bits of entropy, URL-safe with no escaping. */
const TOKEN_BYTES = 32

/**
 * How long each kind of token stays valid.
 *
 * Reset is deliberately much shorter than verification. An unverified address
 * is an inconvenience; a live reset link is an account takeover waiting for
 * someone to read an old email.
 */
export const TOKEN_TTL_SECONDS = {
  email_verification: 60 * 60 * 24, // 24 hours
  password_reset: 60 * 60, // 1 hour
} as const

export type TokenPurpose = keyof typeof TOKEN_TTL_SECONDS

export interface IssuedToken {
  /** Goes in the email. Never stored, never logged. */
  token: string
  /** Goes in the database. */
  tokenHash: string
  expiresAt: Date
}

/** Digest of a token, as stored. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Creates a token and the digest to store against it. */
export function issueToken(purpose: TokenPurpose, now: Date = new Date()): IssuedToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')

  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_SECONDS[purpose] * 1000),
  }
}

/**
 * Compares two digests without leaking where they diverge.
 *
 * Lookup is by digest, so this is belt-and-braces rather than the primary
 * defense — but a digest comparison is exactly the place a timing side channel
 * would live, and the cost of being careful here is nil.
 */
export function tokenHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')

  // timingSafeEqual throws on a length mismatch, which is itself a leak of one
  // bit. Digests are fixed-length, so unequal lengths mean malformed input.
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** Whether a stored token may still be redeemed. */
export function isTokenRedeemable(
  token: { expiresAt: Date; consumedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (token.consumedAt !== null) return false
  return token.expiresAt.getTime() > now.getTime()
}
