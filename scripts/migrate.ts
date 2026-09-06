/**
 * Applies pending database migrations.
 *
 * Run by `npm run db:migrate` locally and as a release step in deployment.
 * Uses its own single connection rather than the pooled application client:
 * migrations must not compete with request traffic for pool slots, and the
 * connection must close cleanly so the process exits.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations.')
  }

  // `max: 1` because migrations must run serially against one session.
  const sql = postgres(url, { max: 1, onnotice: () => undefined })

  try {
    await migrate(drizzle(sql), { migrationsFolder: './db/migrations' })
    process.stdout.write('Migrations applied.\n')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Migration failed: ${String(error)}\n`)
  process.exit(1)
})
