import 'server-only'

import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'

import { auditRecords, users } from '@/db/schema'
import { getEmailTransport } from '@/lib/email'
import { passwordResetEmail, verificationEmail } from '@/lib/email/templates'
import { errors } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { hashPassword, performDummyVerification } from '@/lib/security/password'
import { truncateIp } from '@/lib/security/rate-limit'
import { hashToken, isTokenRedeemable, issueToken } from '@/lib/security/tokens'
import type { TokenPurpose } from '@/lib/security/tokens'
import { getDb } from '@/server/db/client'
import {
  consumeAuthToken,
  findAuthTokenByHash,
  insertAuthToken,
} from '@/server/repositories/auth-tokens'

/**
 * Email verification and password reset.
 *
 * The governing rule is that **no path here reveals whether an address has an
 * account**. Requesting a link for an unknown address does the same amount of
 * work and returns the same answer as requesting one for a real address. Signup
 * already takes this line; a recovery form that broke it would hand back the
 * enumeration oracle signup refuses to be.
 *
 * The second rule is that redeeming a reset invalidates every existing session.
 * A password reset is what someone does when they believe an account is
 * compromised, so leaving the attacker's session alive would defeat the point.
 */

export interface RequestMetadata {
  ip?: string | null
  userAgent?: string | null
}

function hashUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  return createHash('sha256').update(userAgent).digest('hex').slice(0, 32)
}

async function audit(
  action: (typeof auditRecords.$inferInsert)['action'],
  userId: string | null,
  metadata: RequestMetadata,
): Promise<void> {
  try {
    await getDb()
      .insert(auditRecords)
      .values({
        userId,
        action,
        ipPrefix: metadata.ip ? truncateIp(metadata.ip) : null,
        userAgentHash: hashUserAgent(metadata.userAgent),
      })
  } catch (error) {
    // An audit write must never fail the operation it records.
    logger.error('audit.write_failed', { action, error })
  }
}

/** Thrown when a deployment has no email transport configured. */
function requireTransport() {
  const transport = getEmailTransport()
  if (!transport) {
    // Reached only if a route is called while EMAIL_PROVIDER=none. The UI does
    // not offer these flows in that case, so this is a guard, not a user path.
    throw errors.internal(new Error('email transport is not configured'))
  }
  return transport
}

/**
 * Issues a token and emails it, doing nothing observable if the user is absent.
 *
 * Returns nothing in every case. The caller responds identically whether or not
 * an account existed.
 */
async function issueAndSend(
  purpose: TokenPurpose,
  email: string,
  metadata: RequestMetadata,
): Promise<void> {
  const transport = requireTransport()
  const normalized = email.trim().toLowerCase()

  const user = await getDb().query.users.findFirst({
    where: eq(users.email, normalized),
    columns: { id: true, email: true, emailVerifiedAt: true },
  })

  if (!user) {
    // Spend comparable time on the unknown path. Without this, response timing
    // separates real addresses from unknown ones as reliably as an error
    // message would.
    await performDummyVerification()
    logger.info('recovery.requested_for_unknown_address', { purpose })
    return
  }

  // Verification is pointless for an already-verified address, but saying so
  // would confirm the address exists. Stop quietly instead.
  if (purpose === 'email_verification' && user.emailVerifiedAt !== null) {
    logger.info('recovery.verification_already_complete', { userId: user.id })
    return
  }

  const { token, tokenHash, expiresAt } = issueToken(purpose)
  await insertAuthToken({ userId: user.id, purpose, tokenHash, expiresAt })

  const message =
    purpose === 'email_verification'
      ? verificationEmail(user.email, token)
      : passwordResetEmail(user.email, token)

  try {
    await transport.send(message)
  } catch (error) {
    // Logged, not surfaced. A "we could not send that email" response for one
    // address and a success for another is the enumeration leak again, wearing
    // a different hat.
    logger.error('recovery.send_failed', { purpose, userId: user.id, error })
    return
  }

  await audit(
    purpose === 'email_verification'
      ? 'user.email_verification_requested'
      : 'user.password_reset_requested',
    user.id,
    metadata,
  )
}

export async function requestEmailVerification(
  email: string,
  metadata: RequestMetadata = {},
): Promise<void> {
  await issueAndSend('email_verification', email, metadata)
}

export async function requestPasswordReset(
  email: string,
  metadata: RequestMetadata = {},
): Promise<void> {
  await issueAndSend('password_reset', email, metadata)
}

/* ==========================================================================
   Redemption
   ========================================================================== */

/**
 * Resolves a presented token, or throws the same error for every failure.
 *
 * Unknown, expired, already used and wrong-purpose are deliberately
 * indistinguishable. Distinguishing them tells someone holding a stolen or
 * guessed token which of those things it is, and none of the four is
 * individually actionable by a legitimate user anyway — the answer is always
 * "request a new link".
 */
async function redeem(purpose: TokenPurpose, token: string): Promise<string> {
  const invalid = errors.validation(
    { token: ['That link is no longer valid. Request a new one.'] },
    'That link is no longer valid. Request a new one.',
  )

  const trimmed = token.trim()
  if (!trimmed) throw invalid

  const record = await findAuthTokenByHash(hashToken(trimmed))
  if (!record) throw invalid
  if (record.purpose !== purpose) throw invalid
  if (!isTokenRedeemable(record)) throw invalid

  // Atomic: the loser of a race between two clicks gets `false` and the same
  // error as an unknown token.
  if (!(await consumeAuthToken(record.id))) throw invalid

  return record.userId
}

/** Marks an address verified. Idempotent from the user's point of view. */
export async function confirmEmailVerification(
  token: string,
  metadata: RequestMetadata = {},
): Promise<void> {
  const userId = await redeem('email_verification', token)

  await getDb()
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId))

  await audit('user.email_verified', userId, metadata)
  logger.info('recovery.email_verified', { userId })
}

/**
 * Sets a new password from a reset token.
 *
 * Bumping `sessionEpoch` is the load-bearing part. A reset is what someone does
 * when they think an account is compromised, so every outstanding session —
 * including the attacker's — has to die with the old password.
 */
export async function confirmPasswordReset(
  token: string,
  newPassword: string,
  metadata: RequestMetadata = {},
): Promise<void> {
  const userId = await redeem('password_reset', token)

  await getDb()
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      sessionEpoch: sql`${users.sessionEpoch} + 1`,
      // A reset is also how someone gets back in after locking themselves out.
      failedLoginCount: 0,
      lockedUntil: null,
      // Completing a reset proves control of the address, so it verifies it too.
      // Requiring a second confirmation email would be ceremony, not security.
      emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  await audit('user.password_reset', userId, metadata)
  logger.info('recovery.password_reset', { userId })
}
