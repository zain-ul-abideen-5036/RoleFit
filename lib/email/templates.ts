import 'server-only'

import { getEnv } from '@/lib/config/env'
import { PRODUCT } from '@/lib/constants'
import type { EmailMessage } from '@/lib/email/types'

/**
 * The two transactional messages.
 *
 * Plain text only. An HTML body would need inlined styles, a dark-mode
 * fallback and per-client testing to earn its keep, and neither of these
 * messages has anything to say that a paragraph and a link cannot.
 *
 * Neither message contains anything about the account beyond the address it was
 * sent to — no name, no resume titles. A transactional email is forwarded,
 * quoted and left in inboxes for years.
 */

function linkTo(path: string, token: string): string {
  const base = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  return `${base}${path}?token=${encodeURIComponent(token)}`
}

export function verificationEmail(to: string, token: string): EmailMessage {
  const link = linkTo('/verify-email', token)

  return {
    to,
    subject: `Confirm your email address for ${PRODUCT.name}`,
    text: [
      `Confirm your email address to finish setting up your ${PRODUCT.name} account.`,
      '',
      link,
      '',
      'The link is valid for 24 hours and can be used once.',
      '',
      `If you did not create a ${PRODUCT.name} account, you can ignore this message.`,
    ].join('\n'),
  }
}

export function passwordResetEmail(to: string, token: string): EmailMessage {
  const link = linkTo('/reset-password', token)

  return {
    to,
    subject: `Reset your ${PRODUCT.name} password`,
    text: [
      `Someone asked to reset the password for the ${PRODUCT.name} account using this address.`,
      '',
      link,
      '',
      'The link is valid for one hour and can be used once.',
      '',
      // Said explicitly, because the alternative reading — that someone has
      // already got in — is the one a person jumps to.
      'If this was not you, no action is needed. Your password has not changed',
      'and nobody can change it without this link.',
    ].join('\n'),
  }
}
