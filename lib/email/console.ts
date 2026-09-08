import 'server-only'

import { getEnv } from '@/lib/config/env'
import type { EmailMessage, EmailTransport } from '@/lib/email/types'

/**
 * Development transport: writes the message to stderr instead of sending it.
 *
 * The body carries a live verification or reset link, which is a credential, so
 * it is printed **only outside production**. That guarantee lives here rather
 * than only in configuration: an env check can be satisfied today and bypassed
 * by a later edit, whereas a transport that cannot print a credential in
 * production cannot leak one however it is wired up.
 *
 * Written directly rather than through the logger, which redacts by key and
 * would strip the very link a developer needs.
 */

const RULE = '-'.repeat(52)

export function createConsoleTransport(): EmailTransport {
  return {
    name: 'console',

    async send(message: EmailMessage): Promise<void> {
      const body =
        getEnv().NODE_ENV === 'production'
          ? '[body withheld: it contains a single-use link, and this is a production build]'
          : message.text

      const lines = [
        '',
        `--- rolefit email (not sent - console transport) ---`,
        `to:      ${message.to}`,
        `subject: ${message.subject}`,
        '',
        body,
        RULE,
        '',
      ]

      process.stderr.write(lines.join('\n'))
    },
  }
}
