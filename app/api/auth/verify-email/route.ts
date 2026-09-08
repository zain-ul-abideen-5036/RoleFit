import { NextResponse } from 'next/server'

import { verifyEmailInputSchema } from '@/lib/domain/schemas'
import { parseJsonBody, publicRoute } from '@/server/api/handler'
import { confirmEmailVerification } from '@/server/services/account-recovery'

export const runtime = 'nodejs'

/** Redeems a verification token. Single use; every failure looks the same. */
export const POST = publicRoute(
  async ({ request }) => {
    const input = await parseJsonBody(request, verifyEmailInputSchema)

    await confirmEmailVerification(input.token, {
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true })
  },
  { rateLimit: 'auth:recovery_confirm' },
)
