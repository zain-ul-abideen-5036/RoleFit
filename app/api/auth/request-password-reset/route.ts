import { NextResponse } from 'next/server'

import { recoveryRequestSchema } from '@/lib/domain/schemas'
import { parseJsonBody, publicRoute } from '@/server/api/handler'
import { requestPasswordReset } from '@/server/services/account-recovery'

export const runtime = 'nodejs'

/**
 * Sends a password reset link.
 *
 * Always reports success, for the same reason as the verification route: a
 * different answer for a known and an unknown address is an enumeration oracle.
 */
export const POST = publicRoute(
  async ({ request }) => {
    const input = await parseJsonBody(request, recoveryRequestSchema)

    await requestPasswordReset(input.email, {
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true })
  },
  { rateLimit: 'auth:recovery_request' },
)
