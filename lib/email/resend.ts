import 'server-only'

import { AppError, ERROR_CODES } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type { EmailMessage, EmailTransport } from '@/lib/email/types'

/**
 * Resend transport.
 *
 * Chosen as the documented provider because it needs no payment card to start
 * and its API is a single POST. Nothing here is Resend-specific beyond the URL
 * and the body shape.
 */

const ENDPOINT = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000

export interface ResendConfig {
  apiKey: string
  from: string
}

export function createResendTransport(config: ResendConfig): EmailTransport {
  return {
    name: 'resend',

    async send(message: EmailMessage): Promise<void> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

      let response: Response
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
          }),
          signal: controller.signal,
          cache: 'no-store',
        })
      } catch (cause) {
        // A transport failure, including the timeout. The recipient address is
        // deliberately absent from the log: a failed-send log line naming an
        // address is a list of addresses somebody tried to reach.
        logger.error('email.transport_failed', { provider: 'resend' })
        throw new AppError(ERROR_CODES.INTERNAL, { cause })
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        // The status is recorded; the body is not. Provider error bodies echo
        // request content, which here includes a live token.
        logger.error('email.rejected', { provider: 'resend', status: response.status })
        throw new AppError(ERROR_CODES.INTERNAL)
      }
    },
  }
}
