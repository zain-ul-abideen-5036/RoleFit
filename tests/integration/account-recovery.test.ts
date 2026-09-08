import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { users } from '@/db/schema'
import { resetEnvCache } from '@/lib/config/env'
import { resetEmailTransportCache } from '@/lib/email'
import type { EmailMessage } from '@/lib/email/types'
import { AppError } from '@/lib/errors'
import { verifyPassword } from '@/lib/security/password'
import { verifySessionToken } from '@/lib/security/session'
import { getDb } from '@/server/db/client'
import { getCurrentUser, login, signup } from '@/server/auth/service'
import { countLiveAuthTokens } from '@/server/repositories/auth-tokens'
import {
  confirmEmailVerification,
  confirmPasswordReset,
  requestEmailVerification,
  requestPasswordReset,
} from '@/server/services/account-recovery'
import {
  assertMigrated,
  resetDatabase,
  teardownDatabase,
  TEST_PASSWORD,
  uniqueEmail,
} from '@/tests/helpers/db'
import { clearCookies } from '@/tests/setup/integration'

/**
 * Email verification and password reset, against a real database.
 *
 * The properties here cannot be checked without real rows: single use under a
 * race, session invalidation via the epoch, and — most importantly — that a
 * request for an unknown address is indistinguishable from one for a real
 * account.
 *
 * Mail is captured rather than sent. The captured message is where the token
 * comes from, which is also the only place a token legitimately exists.
 */

const sent: EmailMessage[] = []

vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return {
    ...actual,
    getEmailTransport: () => ({
      name: 'console' as const,
      send: async (message: EmailMessage) => {
        sent.push(message)
      },
    }),
  }
})

/** Pulls the token out of the link in the most recent message. */
function tokenFromLastEmail(): string {
  const last = sent.at(-1)
  expect(last, 'no email was sent').toBeDefined()

  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(last!.text)
  expect(match, `no token in: ${last!.text}`).not.toBeNull()
  return decodeURIComponent(match![1]!)
}

async function newAccount(): Promise<{ email: string; userId: string }> {
  const email = uniqueEmail()
  const user = await signup({ email, password: TEST_PASSWORD })
  clearCookies()
  return { email, userId: user.userId }
}

async function userRow(userId: string) {
  const row = await getDb().query.users.findFirst({ where: eq(users.id, userId) })
  expect(row).toBeDefined()
  return row!
}

beforeAll(async () => {
  await assertMigrated()
})

beforeEach(async () => {
  await resetDatabase()
  clearCookies()
  sent.length = 0
  resetEnvCache()
  resetEmailTransportCache()
})

afterAll(async () => {
  await teardownDatabase()
})

describe('requesting a link does not reveal whether the account exists', () => {
  it('reports nothing different for an unknown address', async () => {
    // Both calls resolve. The only difference is invisible from outside: one
    // sent an email and one did not.
    await expect(requestPasswordReset('nobody-here@example.com')).resolves.toBeUndefined()
    expect(sent).toHaveLength(0)
  })

  it('sends for a real address', async () => {
    const { email } = await newAccount()

    await requestPasswordReset(email)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe(email)
  })

  it('stops quietly when verification is requested for an already-verified address', async () => {
    const { email, userId } = await newAccount()

    await requestEmailVerification(email)
    await confirmEmailVerification(tokenFromLastEmail())
    sent.length = 0

    // Saying "already verified" would confirm the address exists.
    await expect(requestEmailVerification(email)).resolves.toBeUndefined()
    expect(sent).toHaveLength(0)
    expect((await userRow(userId)).emailVerifiedAt).not.toBeNull()
  })

  it('is case-insensitive about the address, like signup', async () => {
    const { email } = await newAccount()

    await requestPasswordReset(email.toUpperCase())
    expect(sent).toHaveLength(1)
  })
})

describe('email verification', () => {
  it('marks the address verified', async () => {
    const { email, userId } = await newAccount()
    expect((await userRow(userId)).emailVerifiedAt).toBeNull()

    await requestEmailVerification(email)
    await confirmEmailVerification(tokenFromLastEmail())

    expect((await userRow(userId)).emailVerifiedAt).not.toBeNull()
  })

  it('refuses a verification token presented to the reset flow', async () => {
    const { email } = await newAccount()
    await requestEmailVerification(email)
    const token = tokenFromLastEmail()

    // Purpose is checked, so a link for one flow cannot drive the other.
    await expect(confirmPasswordReset(token, 'AnotherPassword123')).rejects.toBeInstanceOf(AppError)
  })

  it('does not sign anyone in', async () => {
    const { email } = await newAccount()
    await requestEmailVerification(email)

    await confirmEmailVerification(tokenFromLastEmail())

    expect(await getCurrentUser()).toBeNull()
  })
})

describe('password reset', () => {
  it('sets the new password and rejects the old one', async () => {
    const { email, userId } = await newAccount()
    await requestPasswordReset(email)

    await confirmPasswordReset(tokenFromLastEmail(), 'CompletelyNewPass1')

    const row = await userRow(userId)
    expect(await verifyPassword('CompletelyNewPass1', row.passwordHash)).toBe(true)
    expect(await verifyPassword(TEST_PASSWORD, row.passwordHash)).toBe(false)
  })

  it('lets the user log in with the new password', async () => {
    const { email } = await newAccount()
    await requestPasswordReset(email)
    await confirmPasswordReset(tokenFromLastEmail(), 'CompletelyNewPass1')

    await expect(login({ email, password: 'CompletelyNewPass1' })).resolves.toMatchObject({ email })
  })

  it('invalidates every existing session', async () => {
    const { email, userId } = await newAccount()

    // A live session from before the reset, as an attacker would hold.
    const before = await login({ email, password: TEST_PASSWORD })
    const beforeEpoch = (await userRow(userId)).sessionEpoch
    expect(before.userId).toBe(userId)
    clearCookies()

    await requestPasswordReset(email)
    await confirmPasswordReset(tokenFromLastEmail(), 'CompletelyNewPass1')

    // A reset is what someone does when they believe the account is
    // compromised. The attacker's token has to die with the old password.
    expect((await userRow(userId)).sessionEpoch).toBeGreaterThan(beforeEpoch)
  })

  it('verifies the address, since redeeming proves control of the mailbox', async () => {
    const { email, userId } = await newAccount()
    expect((await userRow(userId)).emailVerifiedAt).toBeNull()

    await requestPasswordReset(email)
    await confirmPasswordReset(tokenFromLastEmail(), 'CompletelyNewPass1')

    expect((await userRow(userId)).emailVerifiedAt).not.toBeNull()
  })

  it('clears a login lockout, since a reset is how a locked-out person returns', async () => {
    const { email, userId } = await newAccount()

    await getDb()
      .update(users)
      .set({ failedLoginCount: 10, lockedUntil: new Date(Date.now() + 3_600_000) })
      .where(eq(users.id, userId))

    await requestPasswordReset(email)
    await confirmPasswordReset(tokenFromLastEmail(), 'CompletelyNewPass1')

    const row = await userRow(userId)
    expect(row.failedLoginCount).toBe(0)
    expect(row.lockedUntil).toBeNull()
  })

  it('does not sign the user in', async () => {
    const { email } = await newAccount()
    await requestPasswordReset(email)

    await confirmPasswordReset(tokenFromLastEmail(), 'CompletelyNewPass1')

    // Redeeming proves control of the mailbox, not of the new password. A link
    // in a forwarded inbox must not become a live session.
    expect(await getCurrentUser()).toBeNull()
  })
})

describe('a token can be redeemed exactly once', () => {
  it('refuses the second use of a reset link', async () => {
    const { email } = await newAccount()
    await requestPasswordReset(email)
    const token = tokenFromLastEmail()

    await confirmPasswordReset(token, 'FirstNewPassword1')
    await expect(confirmPasswordReset(token, 'SecondNewPassword1')).rejects.toBeInstanceOf(AppError)
  })

  it('lets only one of two simultaneous redemptions succeed', async () => {
    const { email } = await newAccount()
    await requestPasswordReset(email)
    const token = tokenFromLastEmail()

    // Mail clients prefetch links, so two requests really can overlap.
    const results = await Promise.allSettled([
      confirmPasswordReset(token, 'RaceWinnerPass1'),
      confirmPasswordReset(token, 'RaceLoserPass1'),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
  })

  it('refuses the second use of a verification link', async () => {
    const { email } = await newAccount()
    await requestEmailVerification(email)
    const token = tokenFromLastEmail()

    await confirmEmailVerification(token)
    await expect(confirmEmailVerification(token)).rejects.toBeInstanceOf(AppError)
  })

  it('invalidates the earlier link when a new one is requested', async () => {
    const { email, userId } = await newAccount()

    await requestPasswordReset(email)
    const first = tokenFromLastEmail()

    await requestPasswordReset(email)
    const second = tokenFromLastEmail()
    expect(second).not.toBe(first)

    // Two live links in two inboxes is not what re-requesting means.
    expect(await countLiveAuthTokens(userId, 'password_reset')).toBe(1)
    await expect(confirmPasswordReset(first, 'ShouldNotWork123')).rejects.toBeInstanceOf(AppError)
    await expect(confirmPasswordReset(second, 'ShouldWork12345')).resolves.toBeUndefined()
  })
})

describe('every failure looks the same', () => {
  it.each([
    ['an unknown token', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['a short token', 'tiny'],
    ['an empty token', ''],
  ])('refuses %s with the same error', async (_label, token) => {
    // Unknown, malformed and expired are deliberately indistinguishable: none
    // is separately actionable, and the answer is always "request a new link".
    const error = await confirmPasswordReset(token, 'SomeNewPassword1').catch(
      (caught: unknown) => caught,
    )

    expect(AppError.isAppError(error)).toBe(true)
    expect((error as AppError).message).toMatch(/no longer valid/i)
  })

  it('does not say whether a token was unknown or already spent', async () => {
    const { email } = await newAccount()
    await requestPasswordReset(email)
    const token = tokenFromLastEmail()
    await confirmPasswordReset(token, 'FirstNewPassword1')

    const spent = await confirmPasswordReset(token, 'AgainPassword123').catch(
      (caught: unknown) => caught,
    )
    const unknown = await confirmPasswordReset(
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'AgainPassword123',
    ).catch((caught: unknown) => caught)

    expect((spent as AppError).message).toBe((unknown as AppError).message)
    expect((spent as AppError).code).toBe((unknown as AppError).code)
  })
})

describe('the emailed message', () => {
  it('carries a link to the reset page with the token', async () => {
    const { email } = await newAccount()
    await requestPasswordReset(email)

    expect(sent[0]?.text).toContain('/reset-password?token=')
  })

  it('carries a link to the verification page for verification', async () => {
    const { email } = await newAccount()
    await requestEmailVerification(email)

    expect(sent[0]?.text).toContain('/verify-email?token=')
  })

  it('says the link is single use and time limited', async () => {
    const { email } = await newAccount()
    await requestPasswordReset(email)

    expect(sent[0]?.text).toMatch(/once/i)
    expect(sent[0]?.text).toMatch(/one hour/i)
  })

  it('contains no account detail beyond the address it was sent to', async () => {
    const { email } = await newAccount()
    await requestPasswordReset(email)

    const body = `${sent[0]?.subject} ${sent[0]?.text}`
    // Transactional mail is forwarded, quoted and archived for years.
    expect(body).not.toContain(TEST_PASSWORD)
    expect(body.toLowerCase()).not.toContain('resume')
  })

  it('never contains the stored digest', async () => {
    const { email } = await newAccount()
    await requestPasswordReset(email)

    const token = tokenFromLastEmail()
    const { hashToken } = await import('@/lib/security/tokens')
    expect(sent[0]?.text).not.toContain(hashToken(token))
  })

  it('issues a distinct token every time', async () => {
    const first = await newAccount()
    const second = await newAccount()

    await requestPasswordReset(first.email)
    const firstToken = tokenFromLastEmail()

    await requestPasswordReset(second.email)
    const secondToken = tokenFromLastEmail()

    expect(firstToken).not.toBe(secondToken)
  })
})

describe('a redeemed reset token cannot revive an old session', () => {
  it('leaves a pre-reset token failing verification against the new epoch', async () => {
    const { email, userId } = await newAccount()

    await login({ email, password: TEST_PASSWORD })
    const staleEpoch = (await userRow(userId)).sessionEpoch
    clearCookies()

    await requestPasswordReset(email)
    await confirmPasswordReset(tokenFromLastEmail(), 'CompletelyNewPass1')

    const currentEpoch = (await userRow(userId)).sessionEpoch
    const { createSessionToken } = await import('@/lib/security/session')

    // A token minted with the old epoch still verifies cryptographically — it
    // is the epoch check against the row that strands it.
    const stale = await createSessionToken({ userId, email, epoch: staleEpoch })
    const payload = await verifySessionToken(stale)

    expect(payload?.epoch).toBe(staleEpoch)
    expect(payload?.epoch).not.toBe(currentEpoch)
  })
})
