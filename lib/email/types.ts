/**
 * The email transport contract.
 *
 * Deliberately narrow: one method, no templating, no attachments, no bulk
 * sending. RoleFit sends exactly two kinds of message and both are
 * transactional, so a wider interface would only be surface area to get wrong.
 *
 * Swapping Resend for SES is an environment variable, not a code change.
 */

export type EmailProviderName = 'none' | 'console' | 'resend'

export interface EmailMessage {
  to: string
  subject: string
  /** Plain text is mandatory; some clients render nothing else. */
  text: string
  html?: string
}

export interface EmailTransport {
  readonly name: EmailProviderName
  /**
   * Delivers a message, or throws.
   *
   * Callers must not surface a failure to the user in a way that reveals
   * whether the address exists — see `server/services/account-recovery.ts`.
   */
  send(message: EmailMessage): Promise<void>
}
