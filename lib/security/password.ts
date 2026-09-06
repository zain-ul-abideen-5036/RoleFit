import 'server-only'

import bcrypt from 'bcryptjs'

/**
 * Password hashing.
 *
 * bcrypt is used rather than argon2id, which would be the stronger choice, for
 * a deployment reason: argon2 bindings are native modules and do not build
 * reliably across every serverless runtime this is meant to deploy to. bcrypt
 * at cost 12 remains an appropriate choice, and the interface here is narrow
 * enough that swapping the algorithm later is a single-file change — see
 * `needsRehash`, which exists to support exactly that migration.
 */

/** ~250ms per hash on typical serverless hardware. */
const COST = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST)
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash, so a corrupted row
 * cannot turn a failed login into a 500 that reveals the row exists.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash)
  } catch {
    return false
  }
}

/** Whether a stored hash was produced with weaker parameters than current. */
export function needsRehash(hash: string): boolean {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(hash)
  if (!match) return true
  return Number.parseInt(match[1]!, 10) < COST
}

/**
 * A dummy hash with the same cost as a real one.
 *
 * Compared against when no user exists for the submitted email, so that login
 * takes the same time whether or not the account is real. Without this, request
 * timing enumerates registered addresses.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.MHz1zHnTgQrPGgQKrOoNSTfxsn8Wq7O'

export async function performDummyVerification(): Promise<void> {
  await verifyPassword('not-a-real-password', DUMMY_HASH)
}
