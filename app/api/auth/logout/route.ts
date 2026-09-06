import { NextResponse } from 'next/server'

import { publicRoute } from '@/server/api/handler'
import { logout } from '@/server/auth/service'

export const runtime = 'nodejs'

/** Ends the session. Succeeds whether or not one was present. */
export const POST = publicRoute(async ({ request }) => {
  await logout({
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  })
  return NextResponse.json({ ok: true })
})
