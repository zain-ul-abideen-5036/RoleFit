import { NextResponse } from 'next/server'

import { loginInputSchema } from '@/lib/domain/schemas'
import { parseJsonBody, publicRoute } from '@/server/api/handler'
import { login } from '@/server/auth/service'

export const runtime = 'nodejs'

/**
 * Signs in and starts a session.
 *
 * Limited by IP prefix rather than by email: limiting per email would let an
 * attacker lock a known account out of the product by failing on purpose.
 * Per-account protection is the failure counter in the auth service.
 */
export const POST = publicRoute(
  async ({ request }) => {
    const input = await parseJsonBody(request, loginInputSchema)

    const user = await login(input, {
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({ user: { id: user.userId, email: user.email } })
  },
  { rateLimit: 'auth:login' },
)
