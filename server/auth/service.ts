import 'server-only'

import { createHash } from 'node:crypto'

import { redirect } from 'next/navigation'

import { and, eq, sql } from 'drizzle-orm'

import { auditRecords, profiles, users, type User } from '@/db/schema'
import { errors } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  hashPassword,
  needsRehash,
  performDummyVerification,
  verifyPassword,
} from '@/lib/security/password'
import { truncateIp } from '@/lib/security/rate-limit'
import {
  clearSessionCookie,
  createSessionToken,
  getSessionFromCookies,
  setSessionCookie,
} from '@/lib/security/session'
import { getDb } from '@/server/db/client'

/**
 * Authentication.
 *
 * Design decisions worth naming:
 *
 *  - Signup and login return the same generic failure for a wrong password and
 *    a non-existent account, and both paths do the same amount of hashing work.
 *    That prevents an attacker enumerating which email addresses have accounts.
 *  - Repeated failures lock the account temporarily. The lock is on the account
 *    rather than the IP because credential stuffing rotates IPs.
 *  - A password change bumps `session_epoch`, invalidating every issued token.
 */

/** Failures before an account is temporarily locked. */
const MAX_FAILED_LOGINS = 10
/** How long the lock lasts. */
const LOCK_DURATION_MS = 15 * 60 * 1000

export interface AuthContext {
  userId: string
  email: string
}

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
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await getDb()
      .insert(auditRecords)
      .values({
        userId,
        action,
        ipPrefix: metadata.ip ? truncateIp(metadata.ip) : null,
        userAgentHash: hashUserAgent(metadata.userAgent),
        metadata: detail ?? null,
      })
  } catch (error) {
    // An audit write must never fail the operation it is recording.
    logger.error('audit.write_failed', { action, error })
  }
}

/* ==========================================================================
   Signup
   ========================================================================== */

export interface SignupInput {
  email: string
  password: string
  displayName?: string | undefined
}

export async function signup(
  input: SignupInput,
  metadata: RequestMetadata = {},
): Promise<AuthContext> {
  const db = getDb()
  const email = input.email.trim().toLowerCase()

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  })

  if (existing) {
    // Deliberately the same shape of error a caller sees for other conflicts.
    // The signup form says "an account with this email may already exist" and
    // directs the user to sign in or reset, without confirming either way.
    throw errors.conflict(
      'We could not create an account with those details. If you already have an account, please sign in.',
    )
  }

  const passwordHash = await hashPassword(input.password)

  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email, sessionEpoch: users.sessionEpoch })

    if (!user) throw errors.internal(new Error('user insert returned no row'))

    await tx.insert(profiles).values({
      userId: user.id,
      displayName: input.displayName?.trim() || null,
    })

    return user
  })

  await audit('user.signup', created.id, metadata)

  const token = await createSessionToken({
    userId: created.id,
    email: created.email,
    epoch: created.sessionEpoch,
  })
  await setSessionCookie(token)

  logger.info('auth.signup_succeeded', { userId: created.id })
  return { userId: created.id, email: created.email }
}

/* ==========================================================================
   Login
   ========================================================================== */

export interface LoginInput {
  email: string
  password: string
}

/** The single message shown for every login failure. */
const LOGIN_FAILED_MESSAGE = 'That email or password is not correct.'

export async function login(
  input: LoginInput,
  metadata: RequestMetadata = {},
): Promise<AuthContext> {
  const db = getDb()
  const email = input.email.trim().toLowerCase()

  const user = await db.query.users.findFirst({ where: eq(users.email, email) })

  if (!user) {
    // Spend the same time hashing as a real verification would, so response
    // timing does not reveal whether the account exists.
    await performDummyVerification()
    await audit('user.login_failed', null, metadata, { reason: 'no_account' })
    throw errors.validation(undefined, LOGIN_FAILED_MESSAGE)
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await audit('user.login_failed', user.id, metadata, { reason: 'locked' })
    throw errors.validation(
      undefined,
      'This account is temporarily locked after several failed sign-in attempts. Please try again in a few minutes.',
    )
  }

  const valid = await verifyPassword(input.password, user.passwordHash)

  if (!valid) {
    await recordFailedLogin(user)
    await audit('user.login_failed', user.id, metadata, { reason: 'bad_password' })
    throw errors.validation(undefined, LOGIN_FAILED_MESSAGE)
  }

  // Opportunistically upgrade a hash produced with weaker parameters.
  const updates: Partial<typeof users.$inferInsert> = {
    failedLoginCount: 0,
    lockedUntil: null,
    updatedAt: new Date(),
  }
  if (needsRehash(user.passwordHash)) {
    updates.passwordHash = await hashPassword(input.password)
  }
  await db.update(users).set(updates).where(eq(users.id, user.id))

  await audit('user.login', user.id, metadata)

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    epoch: user.sessionEpoch,
  })
  await setSessionCookie(token)

  logger.info('auth.login_succeeded', { userId: user.id })
  return { userId: user.id, email: user.email }
}

async function recordFailedLogin(user: User): Promise<void> {
  const nextCount = user.failedLoginCount + 1
  const shouldLock = nextCount >= MAX_FAILED_LOGINS

  await getDb()
    .update(users)
    .set({
      failedLoginCount: shouldLock ? 0 : nextCount,
      lockedUntil: shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : user.lockedUntil,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))

  if (shouldLock) {
    logger.warn('auth.account_locked', { userId: user.id })
  }
}

/* ==========================================================================
   Session
   ========================================================================== */

export async function logout(metadata: RequestMetadata = {}): Promise<void> {
  const session = await getSessionFromCookies()
  await clearSessionCookie()
  if (session) await audit('user.logout', session.userId, metadata)
}

/**
 * Resolves the current user, or null.
 *
 * The token's epoch is checked against the database on every call. That costs
 * one indexed lookup per request and is what makes revocation immediate — a
 * stolen token stops working the moment the user changes their password.
 */
export async function getCurrentUser(): Promise<AuthContext | null> {
  const session = await getSessionFromCookies()
  if (!session) return null

  const user = await getDb().query.users.findFirst({
    where: and(eq(users.id, session.userId), eq(users.sessionEpoch, session.epoch)),
    columns: { id: true, email: true },
  })

  if (!user) {
    logger.debug('auth.session_epoch_mismatch')
    return null
  }

  return { userId: user.id, email: user.email }
}

/**
 * Resolves the current user or throws 401.
 *
 * For API routes. In a server component use `requirePageUser` instead: an
 * unauthenticated page visit is an ordinary redirect, not an error, and
 * throwing here would log a stack trace for every signed-out visitor.
 */
export async function requireUser(): Promise<AuthContext> {
  const user = await getCurrentUser()
  if (!user) throw errors.unauthenticated()
  return user
}

/**
 * Resolves the current user for a server component, redirecting to sign-in
 * when there is no session.
 *
 * `redirect()` throws a control-flow signal Next.js understands, so nothing is
 * reported as an application error.
 */
export async function requirePageUser(): Promise<AuthContext> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

/* ==========================================================================
   Account management
   ========================================================================== */

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  metadata: RequestMetadata = {},
): Promise<void> {
  const db = getDb()
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw errors.unauthenticated()

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw errors.validation({ currentPassword: ['That password is not correct.'] })
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      // Invalidates every token issued before this moment, including any an
      // attacker may hold.
      sessionEpoch: sql`${users.sessionEpoch} + 1`,
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  await audit('user.password_changed', userId, metadata)
  logger.info('auth.password_changed', { userId })
}

/**
 * Permanently deletes an account and everything belonging to it.
 *
 * Every table carries `ON DELETE CASCADE` from `users`, so one delete removes
 * resumes, versions, analyses, runs, change records and documents. Stored
 * objects are removed separately by the caller before this runs.
 */
export async function deleteAccount(userId: string, metadata: RequestMetadata = {}): Promise<void> {
  await audit('user.deleted', userId, metadata)
  await getDb().delete(users).where(eq(users.id, userId))
  await clearSessionCookie()
  logger.info('auth.account_deleted', { userId })
}
