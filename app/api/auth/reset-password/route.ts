import { NextResponse } from 'next/server'

import { resetPasswordInputSchema } from '@/lib/domain/schemas'
import { parseJsonBody, publicRoute } from '@/server/api/handler'
import { confirmPasswordReset } from '@/server/services/account-recovery'

export const runtime = 'nodejs'

/**
 * Sets a new password from a reset token.
 *
 * Deliberately does *not* sign the user in afterwards. Redeeming the token
 * proves control of the mailbox, not of the password that was just chosen, and
 * asking them to sign in confirms the new password reached the server intact.
 * It also means a reset link found in a shared inbox cannot be turned straight
 * into a live session.
 */
export const POST = publicRoute(
  async ({ request }) => {
    const input = await parseJsonBody(request, resetPasswordInputSchema)

    await confirmPasswordReset(input.token, input.password, {
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true })
  },
  { rateLimit: 'auth:recovery_confirm' },
)
