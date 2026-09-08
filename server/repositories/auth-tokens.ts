import 'server-only'

import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm'

import { authTokens, type AuthToken } from '@/db/schema'
import type { TokenPurpose } from '@/lib/security/tokens'
import { getDb } from '@/server/db/client'

/**
 * Auth token storage.
 *
 * Lookup is always by digest and never by user, because the caller redeeming a
 * token knows only the token. Nothing here takes an email address: an endpoint
 * that could ask "does this address have a pending reset?" is an account
 * enumeration oracle.
 */

/**
 * Issues a token, invalidating any the user already holds for this purpose.
 *
 * Invalidating first means a second "email me a link" click cannot leave two
 * live links in two inboxes — the older one stops working the moment the newer
 * is sent, which is what a person expects from re-requesting.
 */
export async function insertAuthToken(input: {
  userId: string
  purpose: TokenPurpose
  tokenHash: string
  expiresAt: Date
}): Promise<void> {
  const db = getDb()

  await db.transaction(async (tx) => {
    await tx
      .update(authTokens)
      .set({ consumedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(authTokens.userId, input.userId),
          eq(authTokens.purpose, input.purpose),
          isNull(authTokens.consumedAt),
        ),
      )

    await tx.insert(authTokens).values({
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    })
  })
}

/** Finds a token by digest, regardless of whether it is still redeemable. */
export async function findAuthTokenByHash(tokenHash: string): Promise<AuthToken | null> {
  const found = await getDb().query.authTokens.findFirst({
    where: eq(authTokens.tokenHash, tokenHash),
  })
  return found ?? null
}

/**
 * Marks a token spent, and reports whether this call is the one that spent it.
 *
 * The `consumedAt IS NULL` predicate lives in the UPDATE rather than in a
 * preceding read, so two simultaneous redemptions of the same link cannot both
 * succeed. Reading then writing would leave exactly that race, and the window
 * is real: mail clients prefetch links.
 */
export async function consumeAuthToken(tokenId: string): Promise<boolean> {
  const consumed = await getDb()
    .update(authTokens)
    .set({ consumedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(authTokens.id, tokenId), isNull(authTokens.consumedAt)))
    .returning({ id: authTokens.id })

  return consumed.length === 1
}

/**
 * Deletes expired tokens.
 *
 * Not on a schedule — there is no scheduler — but callable from a maintenance
 * script. Expired rows are harmless (the digest reveals nothing and the token
 * is refused anyway); this is housekeeping, not a control.
 */
export async function deleteExpiredAuthTokens(now: Date = new Date()): Promise<number> {
  const deleted = await getDb()
    .delete(authTokens)
    .where(lt(authTokens.expiresAt, now))
    .returning({ id: authTokens.id })

  return deleted.length
}

/** Count of a user's live tokens for one purpose. Used by tests and diagnostics. */
export async function countLiveAuthTokens(
  userId: string,
  purpose: TokenPurpose,
  now: Date = new Date(),
): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.consumedAt),
        // `gt` rather than a raw sql template: postgres.js cannot bind a JS
        // Date as an untyped parameter and throws at bind time.
        gt(authTokens.expiresAt, now),
      ),
    )

  return rows[0]?.count ?? 0
}
