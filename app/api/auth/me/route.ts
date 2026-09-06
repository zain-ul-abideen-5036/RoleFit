import { NextResponse } from 'next/server'

import { publicRoute } from '@/server/api/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Returns the signed-in user, or null. Never 401s — absence is the answer. */
export const GET = publicRoute(async ({ user }) => {
  return NextResponse.json({
    user: user ? { id: user.userId, email: user.email } : null,
  })
})
