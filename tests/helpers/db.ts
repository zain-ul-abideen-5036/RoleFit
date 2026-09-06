import { sql } from 'drizzle-orm'

import { closeDb, getDb } from '@/server/db/client'

/**
 * Integration-test database helpers.
 *
 * Suites run against a real PostgreSQL instance — the point of these tests is
 * to exercise the actual SQL, constraints and cascade behaviour, which an
 * in-memory fake would not.
 */

/**
 * Empties every table.
 *
 * `TRUNCATE ... CASCADE` in one statement so foreign keys do not dictate
 * ordering, and `RESTART IDENTITY` so sequences do not drift across runs.
 */
export async function resetDatabase(): Promise<void> {
  await getDb().execute(sql`
    truncate table
      audit_records,
      usage_records,
      generated_documents,
      change_records,
      optimization_runs,
      analyses,
      job_descriptions,
      resume_versions,
      resumes,
      profiles,
      users
    restart identity cascade
  `)
}

export async function teardownDatabase(): Promise<void> {
  await closeDb()
}

/** Confirms the schema is present, with a clear message when it is not. */
export async function assertMigrated(): Promise<void> {
  const result = await getDb().execute<{ count: number }>(sql`
    select count(*)::int as count
    from information_schema.tables
    where table_schema = 'public' and table_name = 'users'
  `)

  const row = Array.isArray(result) ? result[0] : (result as unknown as { count: number }[])[0]
  if (!row || Number(row.count) === 0) {
    throw new Error('Database schema is missing. Run:\n  npm run db:up\n  npm run db:migrate')
  }
}

let counter = 0

/** A unique email per call, so tests never collide on the unique index. */
export function uniqueEmail(prefix = 'user'): string {
  counter += 1
  return `${prefix}-${Date.now()}-${counter}@example.test`
}

/** A password satisfying the signup policy. */
export const TEST_PASSWORD = 'Correct-Horse-Battery-9'
