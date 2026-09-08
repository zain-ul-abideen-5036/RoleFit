import { NextResponse } from 'next/server'

import { recoveryRequestSchema } from '@/lib/domain/schemas'
import { parseJsonBody, publicRoute } from '@/server/api/handler'
import { requestEmailVerification } from '@/server/services/account-recovery'

export const runtime = 'nodejs'

/**
 * Sends a verification link.
 *
 * Always reports success. Whether the address has an account, is already
 * verified, or the send failed, the answer is the same — anything else
 * enumerates accounts.
 */
export const POST = publicRoute(
  async ({ request }) => {
    const input = await parseJsonBody(request, recoveryRequestSchema)

    await requestEmailVerification(input.email, {
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true })
  },
  { rateLimit: 'auth:recovery_request' },
)
