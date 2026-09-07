import { NextResponse } from 'next/server'

import { getEnv } from '@/lib/config/env'
import { getSql } from '@/server/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Health check for uptime monitoring and post-deploy smoke tests.
 *
 * Reports database reachability and which providers are configured. It reveals
 * no secrets and no user data, but it does confirm the app is wired correctly —
 * which is exactly what a deployment check needs.
 */
export async function GET(): Promise<NextResponse> {
  const checks: Record<string, string> = {}
  let healthy = true

  try {
    const env = getEnv()
    checks.config = 'ok'
    checks.aiProvider = env.AI_PROVIDER
    checks.storageDriver = env.STORAGE_DRIVER
    checks.rateLimitDriver = env.RATE_LIMIT_DRIVER
  } catch {
    checks.config = 'invalid'
    healthy = false
  }

  try {
    await getSql()`select 1`
    checks.database = 'ok'
  } catch {
    checks.database = 'unreachable'
    healthy = false
  }

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  )
}
