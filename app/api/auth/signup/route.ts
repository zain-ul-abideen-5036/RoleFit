import { NextResponse } from 'next/server'

import { signupInputSchema } from '@/lib/domain/schemas'
import { parseJsonBody, publicRoute } from '@/server/api/handler'
import { signup } from '@/server/auth/service'

export const runtime = 'nodejs'

/**
 * Creates an account and starts a session.
 *
 * Rate limited by IP prefix: signup is unauthenticated, so there is no account
 * to limit against, and the limit is what stops bulk account creation.
 */
export const POST = publicRoute(
  async ({ request }) => {
    const input = await parseJsonBody(request, signupInputSchema)

    const user = await signup(
      {
        email: input.email,
        password: input.password,
        displayName: input.displayName,
      },
      {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      },
    )

    return NextResponse.json({ user: { id: user.userId, email: user.email } }, { status: 201 })
  },
  { rateLimit: 'auth:signup' },
)
