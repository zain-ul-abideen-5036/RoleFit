import { describe, expect, it } from 'vitest'

import {
  TOKEN_TTL_SECONDS,
  hashToken,
  isTokenRedeemable,
  issueToken,
  tokenHashesMatch,
} from '@/lib/security/tokens'

/**
 * Verification and reset tokens.
 *
 * These are the credentials that travel by email, so what matters is that they
 * are unguessable, that the stored form cannot be turned back into the emailed
 * form, and that a token can be redeemed exactly once.
 */

describe('issueToken', () => {
  it('produces a URL-safe token that needs no escaping in a link', () => {
    const { token } = issueToken('email_verification')

    // base64url: a token that needed percent-encoding would break the moment
    // an email client rewrote the link.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('carries 256 bits of entropy', () => {
    const { token } = issueToken('password_reset')

    // 32 random bytes in base64url is 43 characters with no padding.
    expect(token).toHaveLength(43)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
  })

  it('never repeats', () => {
    const tokens = new Set(
      Array.from({ length: 1000 }, () => issueToken('email_verification').token),
    )
    expect(tokens.size).toBe(1000)
  })

  it('returns a digest that matches the token', () => {
    const { token, tokenHash } = issueToken('email_verification')
    expect(tokenHash).toBe(hashToken(token))
  })

  it('does not return the token inside the digest', () => {
    // Stating the obvious, because the whole design rests on it: what goes in
    // the database must not contain what went in the email.
    const { token, tokenHash } = issueToken('password_reset')
    expect(tokenHash).not.toContain(token)
  })

  it('expires a verification token in 24 hours', () => {
    const now = new Date('2026-03-09T12:00:00Z')
    const { expiresAt } = issueToken('email_verification', now)

    expect(expiresAt.getTime() - now.getTime()).toBe(TOKEN_TTL_SECONDS.email_verification * 1000)
  })

  it('expires a reset token far sooner than a verification token', () => {
    // An unverified address is an inconvenience. A live reset link in an old
    // email is an account takeover waiting to happen.
    expect(TOKEN_TTL_SECONDS.password_reset).toBeLessThan(TOKEN_TTL_SECONDS.email_verification)
  })
})

describe('hashToken', () => {
  it('is a hex SHA-256 digest', () => {
    expect(hashToken('anything')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable, so a token issued now still looks up later', () => {
    expect(hashToken('same-token')).toBe(hashToken('same-token'))
  })

  it('differs for tokens differing by one character', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'))
  })
})

describe('tokenHashesMatch', () => {
  it('matches identical digests', () => {
    const digest = hashToken('a-token')
    expect(tokenHashesMatch(digest, digest)).toBe(true)
  })

  it('rejects different digests', () => {
    expect(tokenHashesMatch(hashToken('a'), hashToken('b'))).toBe(false)
  })

  it('returns false rather than throwing on a length mismatch', () => {
    // timingSafeEqual throws when lengths differ, which would turn malformed
    // input into a 500 and leak one bit about the stored value.
    expect(tokenHashesMatch('short', hashToken('a'))).toBe(false)
    expect(tokenHashesMatch('', '')).toBe(true)
  })
})

describe('isTokenRedeemable', () => {
  const now = new Date('2026-03-09T12:00:00Z')

  it('accepts an unconsumed token that has not expired', () => {
    expect(
      isTokenRedeemable({ expiresAt: new Date(now.getTime() + 1000), consumedAt: null }, now),
    ).toBe(true)
  })

  it('refuses a token that has already been used', () => {
    // Single use is the point. A reset link that works twice is a reset link
    // that works after the account has been handed to someone else.
    expect(
      isTokenRedeemable(
        { expiresAt: new Date(now.getTime() + 60_000), consumedAt: new Date(now.getTime() - 1000) },
        now,
      ),
    ).toBe(false)
  })

  it('refuses an expired token', () => {
    expect(
      isTokenRedeemable({ expiresAt: new Date(now.getTime() - 1000), consumedAt: null }, now),
    ).toBe(false)
  })

  it('refuses a token expiring exactly now', () => {
    expect(isTokenRedeemable({ expiresAt: now, consumedAt: null }, now)).toBe(false)
  })

  it('refuses a token that is both expired and consumed', () => {
    expect(
      isTokenRedeemable({ expiresAt: new Date(now.getTime() - 1000), consumedAt: now }, now),
    ).toBe(false)
  })
})
