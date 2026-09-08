import 'server-only'

import { getEnv } from '@/lib/config/env'
import type { QueueDriverName } from '@/lib/queue/types'

/** Which dispatch mode this deployment runs. */
export function queueDriver(): QueueDriverName {
  return getEnv().QUEUE_DRIVER
}

/**
 * Whether optimization work is handed to a worker rather than run in-request.
 *
 * Callers branch on this to decide between 201-with-a-result and
 * 202-with-a-run-id. The client handles both, so switching modes needs no
 * client change — it reads the status it is given rather than assuming one.
 */
export function queueIsEnabled(): boolean {
  return queueDriver() === 'database'
}

export type { QueueDriverName }
