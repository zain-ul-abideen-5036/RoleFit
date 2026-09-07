/**
 * Blocks until PostgreSQL accepts connections.
 *
 * Used between `docker compose up` and `db:migrate`, and in CI before the
 * integration suite: a container reports "started" well before Postgres is
 * ready to serve queries.
 */
import postgres from 'postgres'

const MAX_ATTEMPTS = 40
const DELAY_MS = 500

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'postgresql://rolefit:rolefit@localhost:5433/rolefit'

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const sql = postgres(url, { max: 1, connect_timeout: 2, onnotice: () => undefined })
    try {
      await sql`select 1`
      await sql.end({ timeout: 2 })
      process.stdout.write(`Database ready after ${attempt} attempt(s).\n`)
      return
    } catch {
      await sql.end({ timeout: 1 }).catch(() => undefined)
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
    }
  }

  process.stderr.write('Database did not become ready in time.\n')
  process.exit(1)
}

void main()
