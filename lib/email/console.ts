import 'server-only'

import type { EmailMessage, EmailTransport } from '@/lib/email/types'

/**
 * Development transport: writes the message to stderr instead of sending it.
 *
 * This prints a live verification or reset link, which is a credential. That is
 * acceptable here and nowhere else, so the environment validator refuses this
 * driver in production rather than relying on nobody selecting it by accident.
 *
 * Written directly rather than through the logger, which redacts by key and
 * would strip the very link a developer needs.
 */
export function createConsoleTransport(): EmailTransport {
  return {
    name: 'console',

    async send(message: EmailMessage): Promise<void> {
      process.stderr.write(
        [
          '',
          '─── rolefit email (not sent — console transport) ───',
          `to:      ${message.to}`,
          `subject: ${message.subject}`,
          '',
          message.text,
          '────────────────────────────────────────────────────',
          '',
        ].join('\n'),
      )
    },
  }
}
