/**
 * Applies pending database migrations.
 *
 * Run by `npm run db:migrate` locally and `npm run deploy:migrate` against a
 * production database. In the latter case `DATABASE_URL` comes from
 * `.env.production.local` if it is not already set in the environment, so
 * there is no credential in shell history.
 * Uses its own single connection rather than the pooled application client:
 * migrations must not compete with request traffic for pool slots, and the
 * connection must close cleanly so the process exits.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { PRODUCTION_ENV_FILE, loadEnvFileIfPresent } from './lib/env-file'

async function main(): Promise<void> {
  // An explicitly set variable always wins; the file is a fallback.
  const fromFile = loadEnvFileIfPresent()

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      `DATABASE_URL is required to run migrations.
` +
        `Set it in the environment, or put it in ${PRODUCTION_ENV_FILE} ` +
        `(run \`npm run deploy:init\` to create that file).`,
    )
  }

  if (fromFile.includes('DATABASE_URL')) {
    process.stdout.write(`Using DATABASE_URL from ${PRODUCTION_ENV_FILE}.
`)
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
