import 'server-only'

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '@/db/schema'
import { getEnv } from '@/lib/config/env'

/**
 * Database client.
 *
 * A single pooled connection is memoised on `globalThis` so Next.js' dev-mode
 * module reloading does not open a new pool on every edit, and so a warm
 * serverless instance reuses its connection instead of reconnecting per request.
 *
 * Pool size is deliberately small: serverless scales by process count, and a
 * large per-instance pool exhausts Postgres' connection limit long before it
 * helps throughput.
 */

type Database = PostgresJsDatabase<typeof schema>

interface GlobalWithDatabase {
  __rolefitSql?: ReturnType<typeof postgres>
  __rolefitDb?: Database
}

const globalRef = globalThis as unknown as GlobalWithDatabase

function createClient(): { sql: ReturnType<typeof postgres>; db: Database } {
  const env = getEnv()

  const sql = postgres(env.DATABASE_URL, {
    max: env.DATABASE_POOL_MAX,
    // Serverless functions are frozen between invocations; a long idle timeout
    // leaves connections the platform will never let us close.
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => undefined,
  })

  return { sql, db: drizzle(sql, { schema, logger: false }) }
}

export function getDb(): Database {
  if (!globalRef.__rolefitDb) {
    const { sql, db } = createClient()
    globalRef.__rolefitSql = sql
    globalRef.__rolefitDb = db
  }
  return globalRef.__rolefitDb
}

/** Raw driver handle, for migrations and integration-test teardown. */
export function getSql(): ReturnType<typeof postgres> {
  if (!globalRef.__rolefitSql) getDb()
  return globalRef.__rolefitSql!
}

/** Closes the pool. Used by scripts and tests; never in a request path. */
export async function closeDb(): Promise<void> {
  if (globalRef.__rolefitSql) {
    await globalRef.__rolefitSql.end({ timeout: 5 })
    globalRef.__rolefitSql = undefined
    globalRef.__rolefitDb = undefined
  }
}

export { schema }
export type { Database }
