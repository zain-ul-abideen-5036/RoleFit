import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { getStorage } from '@/lib/storage'
import { route } from '@/server/api/handler'
import { deleteAccount } from '@/server/auth/service'
import { listAllStorageKeys } from '@/server/repositories'

export const runtime = 'nodejs'

/**
 * Permanently deletes the account and everything in it.
 *
 * Stored objects are removed before the database rows, because the rows are the
 * only record of which objects exist — deleting them first would orphan every
 * file. Object deletion is best-effort per key so one failure does not abort
 * the rest, and the database cascade then removes all record of them.
 */
export const DELETE = route(async ({ request, user }) => {
  const keys = await listAllStorageKeys(user.userId)
  const storage = getStorage()

  let failed = 0
  for (const key of keys) {
    try {
      await storage.delete(key)
    } catch {
      failed += 1
    }
  }

  if (failed > 0) {
    logger.error('account.storage_purge_incomplete', { userId: user.userId, failed })
  }

  await deleteAccount(user.userId, {
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json({ ok: true, objectsDeleted: keys.length - failed })
})
