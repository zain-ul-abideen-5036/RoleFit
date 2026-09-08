import { NextResponse } from 'next/server'

import { EnvConfigError, getEnv } from '@/lib/config/env'
import { getSql } from '@/server/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Health check for uptime monitoring and post-deploy smoke tests.
 *
 * Reports database reachability and which providers are configured. It reveals
 * no secrets and no user data, but it does confirm the app is wired correctly —
 * which is exactly what a deployment check needs.
 *
 * It also names what is wrong, which is the whole point of it existing. A first
 * deploy with nothing configured answers `config: invalid, database:
 * unreachable`, and without the names that is indistinguishable from a dozen
 * other faults: the operator is left reading a generic 500 from the sign-up
 * form with nothing to act on.
 *
 * What it names is deliberately limited to variable *names* and a fixed set of
 * status words. Never a value, never a validation message — a zod enum failure
 * echoes the value it received, so a credential pasted into the wrong field
 * would be echoed back on a public endpoint.
 */

type DatabaseStatus = 'ok' | 'not-migrated' | 'unreachable' | 'unknown'

/**
 * Reachability and whether the schema exists, in as few round trips as it takes.
 *
 * The first query doubles as the reachability probe: `to_regclass` returns null
 * for a missing relation rather than raising, so a missing schema and an
 * unreachable database stay distinguishable without matching on error text.
 *
 * The ledger is drizzle's own, not a hand-written list of expected tables. A
 * list would drift the moment a table is renamed and then report a healthy
 * database as broken, which is worse than not checking at all.
 */
async function checkDatabase(): Promise<DatabaseStatus> {
  try {
    // Inside the try, not above it. `getSql()` builds the pool from `getEnv()`,
    // so it throws whenever configuration is invalid — which is precisely when
    // this endpoint is being read. Constructing it outside turned the one case
    // this check exists to explain into an uncaught 500 with no body at all.
    const sql = getSql()

    const [probe] = await sql<{ hasLedger: boolean }[]>`
      select to_regclass('drizzle.__drizzle_migrations') is not null as "hasLedger"
    `

    if (!probe?.hasLedger) return 'not-migrated'

    const [ledger] = await sql<{ n: number }[]>`
      select count(*)::int as n from drizzle.__drizzle_migrations
    `

    // An empty ledger means the table was created but nothing was applied, so
    // the app's own tables are not there either.
    return (ledger?.n ?? 0) > 0 ? 'ok' : 'not-migrated'
  } catch {
    return 'unreachable'
  }
}

export async function GET(): Promise<NextResponse> {
  const checks: Record<string, string> = {}
  let healthy = true

  /** Variables that failed validation. Names only — see the note above. */
  let invalidConfigKeys: readonly string[] = []

  try {
    const env = getEnv()
    checks.config = 'ok'
    checks.aiProvider = env.AI_PROVIDER
    checks.storageDriver = env.STORAGE_DRIVER
    checks.rateLimitDriver = env.RATE_LIMIT_DRIVER
  } catch (error) {
    checks.config = 'invalid'
    healthy = false
    if (error instanceof EnvConfigError) invalidConfigKeys = error.keys
  }

  // Reported as unknown rather than checked, because it cannot be checked. The
  // pool is built from `getEnv()`, so when configuration is invalid — for any
  // key, not just DATABASE_URL — the connection is never attempted and any
  // verdict here would be invented.
  //
  // It said "unreachable" instead, and that cost a real deployment a detour:
  // the actual fault was STORAGE_DRIVER, while the response sent its operator
  // to go and re-check a Neon connection string that was correct all along.
  const database = checks.config === 'ok' ? await checkDatabase() : 'unknown'
  checks.database = database
  if (database !== 'ok') healthy = false

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks,
      // Omitted rather than sent empty, so a healthy response stays the shape
      // it has always been.
      ...(invalidConfigKeys.length > 0 ? { invalidConfig: invalidConfigKeys } : {}),
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  )
}
