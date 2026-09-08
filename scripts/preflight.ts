/**
 * Pre-deployment preflight.
 *
 * Reads a production env file, checks every value the schema requires, then
 * actually talks to each service — a real query, a real object round trip, a
 * real Redis command. Finally it prints the exact variable list to paste into
 * the hosting platform.
 *
 * The point is to move every failure that would otherwise happen *after*
 * deployment to before it. A wrong storage region is an opaque 403 on someone's
 * first upload; a wrong Neon string is a 503 on every request. Both are cheap
 * to find here and expensive to find in production.
 *
 *   npm run deploy:preflight                       # reads .env.production.local
 *   npm run deploy:preflight -- path/to/env        # or an explicit path
 *   npm run deploy:preflight -- --print-env        # print the values to paste
 *
 * The default output carries no credentials, because terminal output is the
 * thing people paste when asking for help. `--print-env` is the only path that
 * prints secrets, and it warns before it does.
 *
 * Nothing here writes to the database or leaves anything behind: the storage
 * check deletes the object it uploads, and the Redis check deletes its key.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { PRODUCTION_ENV_FILE, parseEnvFile } from './lib/env-file'

const DEFAULT_ENV_FILE = PRODUCTION_ENV_FILE

/* ==========================================================================
   Reporting
   ========================================================================== */

type Status = 'pass' | 'fail' | 'skip'

interface Check {
  name: string
  status: Status
  detail: string
  /** What to do about it. Present whenever the check did not pass. */
  fix?: string
}

const checks: Check[] = []

function record(check: Check): void {
  checks.push(check)
  const mark = check.status === 'pass' ? '  OK  ' : check.status === 'skip' ? ' SKIP ' : ' FAIL '
  process.stdout.write(`[${mark}] ${check.name}\n`)
  process.stdout.write(`         ${check.detail}\n`)
  if (check.fix) process.stdout.write(`         -> ${check.fix}\n`)
}

/** Never print a credential, even on the machine that owns it. */
function redact(value: string | undefined): string {
  if (!value) return '(not set)'
  if (value.length <= 8) return '********'
  return `${value.slice(0, 4)}…${value.slice(-2)} (${value.length} chars)`
}

/* ==========================================================================
   Checks
   ========================================================================== */

const REQUIRED_FOR_PRODUCTION = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'STORAGE_DRIVER',
  'STORAGE_ENDPOINT',
  'STORAGE_REGION',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'STORAGE_BUCKET',
] as const

function checkPresence(env: Record<string, string>): boolean {
  const missing = REQUIRED_FOR_PRODUCTION.filter((key) => !env[key]?.trim())

  if (missing.length > 0) {
    record({
      name: 'Required variables',
      status: 'fail',
      detail: `${missing.length} still empty: ${missing.join(', ')}`,
      fix: 'Fill these in from the service dashboards. See docs/deployment.md.',
    })
    return false
  }

  record({
    name: 'Required variables',
    status: 'pass',
    detail: `All ${REQUIRED_FOR_PRODUCTION.length} present.`,
  })
  return true
}

function checkAuthSecret(env: Record<string, string>): void {
  const secret = env['AUTH_SECRET'] ?? ''

  if (secret.startsWith('replace-me')) {
    record({
      name: 'AUTH_SECRET',
      status: 'fail',
      detail: 'Still the placeholder from .env.example.',
      fix: "Run: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
    })
    return
  }

  if (secret.length < 32) {
    record({
      name: 'AUTH_SECRET',
      status: 'fail',
      detail: `Only ${secret.length} characters; 32 is the minimum.`,
      fix: 'Generate a longer one. It signs every session cookie.',
    })
    return
  }

  record({ name: 'AUTH_SECRET', status: 'pass', detail: `${secret.length} characters.` })
}

/**
 * Two separate findings rather than one.
 *
 * A missing `sslmode=require` and an unreachable database are different
 * problems with different fixes, and short-circuiting on the first hides the
 * second — so the connection is attempted either way. It also means this
 * function is verifiable against a local instance, which has no TLS.
 */
function checkDatabaseUrl(env: Record<string, string>): void {
  const url = env['DATABASE_URL'] ?? ''
  if (!url.trim()) return

  if (!url.includes('sslmode=require')) {
    record({
      name: 'DATABASE_URL over TLS',
      status: 'fail',
      detail: 'The connection string does not request TLS.',
      fix: 'Append ?sslmode=require. Neon provides it; a plain local instance does not need it.',
    })
    return
  }

  record({
    name: 'DATABASE_URL over TLS',
    status: 'pass',
    detail: 'Requests sslmode=require.',
  })
}

async function checkDatabase(env: Record<string, string>): Promise<void> {
  const url = env['DATABASE_URL'] ?? ''

  if (!url.trim()) {
    record({
      name: 'Neon PostgreSQL',
      status: 'skip',
      detail: 'DATABASE_URL is empty.',
      fix: 'Paste the pooled connection string from the Neon dashboard.',
    })
    return
  }

  const { default: postgres } = await import('postgres')
  const sql = postgres(url, { max: 1, onnotice: () => undefined, connect_timeout: 15 })

  try {
    // Drizzle's own ledger, not a hand-written list of table names. A list
    // here would silently drift the moment a table is renamed and would then
    // report a healthy database as broken — which is worse than no check.
    const [ledger] = await sql<{ n: number }[]>`
      select count(*)::int as n from drizzle.__drizzle_migrations
    `
    const [tables] = await sql<{ n: number }[]>`
      select count(*)::int as n from information_schema.tables where table_schema = 'public'
    `

    const applied = ledger?.n ?? 0
    if (applied === 0) {
      record({
        name: 'Neon PostgreSQL',
        status: 'fail',
        detail: 'Connected, but no migrations have been applied.',
        fix: 'Run: npm run deploy:migrate',
      })
      return
    }

    record({
      name: 'Neon PostgreSQL',
      status: 'pass',
      detail: `Connected. ${applied} migration(s) applied, ${tables?.n ?? 0} tables.`,
    })
  } catch (error) {
    const message = describe(error)

    // A missing ledger means the app's own tables cannot be there either.
    if (/__drizzle_migrations|schema "drizzle"/i.test(message)) {
      record({
        name: 'Neon PostgreSQL',
        status: 'fail',
        detail: 'Connected, but the schema has never been migrated.',
        fix: 'Run: npm run deploy:migrate',
      })
      return
    }

    record({
      name: 'Neon PostgreSQL',
      status: 'fail',
      detail: message,
      fix: 'Check the connection string. Use the POOLED one (its host contains "-pooler").',
    })
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined)
  }
}

async function checkStorage(env: Record<string, string>): Promise<void> {
  const region = env['STORAGE_REGION'] ?? ''
  const endpoint = env['STORAGE_ENDPOINT'] ?? ''

  const needed = [
    'STORAGE_ENDPOINT',
    'STORAGE_REGION',
    'STORAGE_ACCESS_KEY',
    'STORAGE_SECRET_KEY',
    'STORAGE_BUCKET',
  ]
  const missing = needed.filter((key) => !env[key]?.trim())

  if (missing.length > 0) {
    record({
      name: 'Backblaze B2',
      status: 'skip',
      detail: `Waiting on ${missing.join(', ')}.`,
      fix: 'Fill these from the bucket page and the application key you created.',
    })
    return
  }

  // Same cross-check the app performs at startup, run here so a mismatch is
  // caught before it becomes an unexplained 403 on someone's first upload.
  const endpointRegion = /^s3\.([a-z]{2,}-[a-z]+-\d{1,3})\./.exec(
    endpoint.replace(/^https?:\/\//, ''),
  )?.[1]

  if (endpointRegion && endpointRegion !== region) {
    record({
      name: 'Backblaze B2',
      status: 'fail',
      detail: `STORAGE_REGION is "${region}" but the endpoint names "${endpointRegion}".`,
      fix: `Set STORAGE_REGION=${endpointRegion}`,
    })
    return
  }

  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } =
    await import('@aws-sdk/client-s3')

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: (env['STORAGE_FORCE_PATH_STYLE'] ?? 'true') !== 'false',
    credentials: {
      accessKeyId: env['STORAGE_ACCESS_KEY'] ?? '',
      secretAccessKey: env['STORAGE_SECRET_KEY'] ?? '',
    },
  })

  const bucket = env['STORAGE_BUCKET'] ?? ''
  // Deliberately outside the app's key namespace, so a stray object from a
  // failed preflight can never be mistaken for a user's document.
  const key = `preflight/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
  const body = new TextEncoder().encode('rolefit preflight')

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'text/plain',
        ServerSideEncryption: 'AES256',
      }),
    )
  } catch (error) {
    record({
      name: 'Backblaze B2',
      status: 'fail',
      detail: `Upload refused: ${describe(error)}`,
      fix: 'Check the keyID, applicationKey and bucket name, and that the key is scoped to this bucket with Read and Write.',
    })
    return
  }

  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const bytes = await response.Body?.transformToByteArray()

    if (!bytes || bytes.length !== body.length) {
      record({
        name: 'Backblaze B2',
        status: 'fail',
        detail: 'Uploaded, but the object read back did not match.',
        fix: 'Unexpected. Re-run; if it persists, check the bucket is not versioned oddly.',
      })
      return
    }

    record({
      name: 'Backblaze B2',
      status: 'pass',
      detail: 'Uploaded, read back and deleted a test object.',
    })
  } catch (error) {
    record({
      name: 'Backblaze B2',
      status: 'fail',
      detail: `Upload worked but read failed: ${describe(error)}`,
      fix: 'The application key needs Read as well as Write.',
    })
  } finally {
    // Always clean up, including after a failed read.
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined)
  }
}

async function checkRateLimiter(env: Record<string, string>): Promise<void> {
  if ((env['RATE_LIMIT_DRIVER'] ?? 'memory') !== 'upstash') {
    record({
      name: 'Upstash Redis',
      status: 'skip',
      detail: 'RATE_LIMIT_DRIVER is not "upstash".',
      fix: 'Optional, but rate limits are per-instance without it — they multiply by instance count.',
    })
    return
  }

  const url = (env['UPSTASH_REDIS_REST_URL'] ?? '').replace(/\/$/, '')
  const token = env['UPSTASH_REDIS_REST_TOKEN'] ?? ''

  if (!url || !token) {
    record({
      name: 'Upstash Redis',
      status: 'fail',
      detail: 'Driver is "upstash" but the URL or token is missing.',
      fix: 'Copy both from the REST API section of the Upstash database page.',
    })
    return
  }

  const key = `rolefit:preflight:${Date.now()}`

  try {
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify([
        ['INCR', key],
        ['DEL', key],
      ]),
      cache: 'no-store',
    })

    if (!response.ok) {
      record({
        name: 'Upstash Redis',
        status: 'fail',
        detail: `Rejected with HTTP ${response.status}.`,
        fix: response.status === 401 ? 'The token is wrong.' : 'Check the REST URL.',
      })
      return
    }

    record({
      name: 'Upstash Redis',
      status: 'pass',
      detail: 'Incremented and deleted a test key.',
    })
  } catch (error) {
    record({
      name: 'Upstash Redis',
      status: 'fail',
      detail: describe(error),
      fix: 'Check UPSTASH_REDIS_REST_URL is the REST endpoint, not the redis:// URL.',
    })
  }
}

function checkOptionalProviders(env: Record<string, string>): void {
  const ai = env['AI_PROVIDER'] ?? 'deterministic'
  record({
    name: 'AI provider',
    status: ai === 'deterministic' || env['AI_API_KEY'] ? 'pass' : 'fail',
    detail:
      ai === 'deterministic'
        ? 'deterministic — the offline engine. No key needed, nothing leaves the machine.'
        : `${ai} with a key ${redact(env['AI_API_KEY'])}.`,
    ...(ai !== 'deterministic' && !env['AI_API_KEY']
      ? { fix: `AI_API_KEY is required when AI_PROVIDER is "${ai}".` }
      : {}),
  })

  const email = env['EMAIL_PROVIDER'] ?? 'none'
  if (email === 'console') {
    record({
      name: 'Email provider',
      status: 'fail',
      detail: 'EMAIL_PROVIDER=console does not send email and is refused on hosted production.',
      fix: 'Use "resend" with a key, or "none" to disable password reset entirely.',
    })
  } else {
    record({
      name: 'Email provider',
      status: 'pass',
      detail:
        email === 'none'
          ? 'none — password reset and verification are disabled, and the UI hides them.'
          : `${email}, sending from ${env['EMAIL_FROM'] ?? '(not set)'}.`,
    })
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    // First line only. A driver stack trace is noise in a checklist.
    return error.message.split('\n')[0]!.slice(0, 160)
  }
  return String(error).slice(0, 160)
}

/* ==========================================================================
   The paste block
   ========================================================================== */

/** Variables to set on the host, in the order the guide lists them. */
const VERCEL_KEYS = [
  'DATABASE_URL',
  'DATABASE_POOL_MAX',
  'AUTH_SECRET',
  'STORAGE_DRIVER',
  'STORAGE_ENDPOINT',
  'STORAGE_REGION',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'STORAGE_BUCKET',
  'STORAGE_FORCE_PATH_STYLE',
  'RATE_LIMIT_DRIVER',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'AI_PROVIDER',
  'EMAIL_PROVIDER',
  'QUEUE_DRIVER',
  'EMBEDDINGS_PROVIDER',
  'LOG_LEVEL',
] as const

/**
 * Prints the real values, unredacted, deliberately — and only when asked.
 *
 * This is the output the operator copies into the hosting platform, so masking
 * it would make it useless. But it must never be part of the default run: this
 * block and the check summary share one scroll buffer, and the summary is
 * exactly what someone selects and pastes into a chat when a deploy will not
 * come up. That happened, and it published a live database password, a storage
 * key and a session secret in a single paste.
 *
 * So the default run is safe to share, this lives behind `--print-env`, and it
 * says what it is about to print before printing it.
 */
function printPasteBlock(env: Record<string, string>): void {
  process.stdout.write('\n')
  process.stdout.write('!! The lines below are live credentials. Do not paste them into a\n')
  process.stdout.write('!! chat, an issue, or a screenshot. They belong in the Vercel\n')
  process.stdout.write('!! dashboard and nowhere else.\n\n')
  process.stdout.write('Paste these into Vercel (Settings -> Environment Variables):\n')
  process.stdout.write('-'.repeat(64) + '\n')

  for (const key of VERCEL_KEYS) {
    const value = env[key]
    if (value === undefined || value === '') continue
    process.stdout.write(`${key}=${value}\n`)
  }

  process.stdout.write('-'.repeat(64) + '\n')
  process.stdout.write(
    'NEXT_PUBLIC_APP_URL is deliberately absent. Add it after the first\n' +
      'deploy, once Vercel has given you a URL, then redeploy. It is baked\n' +
      'into the browser bundle, so it cannot be picked up without a rebuild.\n',
  )
}

/* ==========================================================================
   Entry point
   ========================================================================== */

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const printOnly = args.includes('--print-env')
  const path = resolve(process.cwd(), args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_ENV_FILE)

  let contents: string
  try {
    contents = readFileSync(path, 'utf8')
  } catch {
    process.stderr.write(
      `Could not read ${path}\n\n` +
        `Create it first:\n` +
        `  cp .env.production.template ${DEFAULT_ENV_FILE}\n\n` +
        `then fill in the values from Neon, Backblaze and Upstash.\n`,
    )
    process.exit(1)
  }

  const env = parseEnvFile(contents)

  // Re-printing the paste block should not require another round of network
  // checks, and it is what someone wants when they have lost the terminal
  // scrollback rather than changed a credential.
  if (printOnly) {
    printPasteBlock(env)
    return
  }

  process.stdout.write(`RoleFit preflight\n`)
  process.stdout.write(`Reading ${path}\n\n`)

  // Every check runs regardless of what else is missing. Gating them would
  // make this an iterate-and-rerun loop, when the whole point is to see
  // everything that is wrong in one pass.
  checkPresence(env)
  checkAuthSecret(env)
  checkDatabaseUrl(env)
  await checkDatabase(env)
  await checkStorage(env)
  await checkRateLimiter(env)
  checkOptionalProviders(env)

  const failed = checks.filter((check) => check.status === 'fail')
  const skipped = checks.filter((check) => check.status === 'skip')

  process.stdout.write('\n' + '='.repeat(64) + '\n')

  if (failed.length > 0) {
    process.stdout.write(`${failed.length} check(s) failed. Do not deploy yet.\n`)
    for (const check of failed) process.stdout.write(`  - ${check.name}: ${check.detail}\n`)
    process.exit(1)
  }

  process.stdout.write(
    `All checks passed${skipped.length > 0 ? ` (${skipped.length} skipped)` : ''}.\n`,
  )

  // Deliberately not printed here. See printPasteBlock: this summary is what
  // gets pasted when someone asks for help, and whatever shares the buffer with
  // it gets pasted along with it.
  process.stdout.write(
    `\nTo print the variables to paste into Vercel:\n\n` +
      `  npm run deploy:preflight -- --print-env\n\n` +
      `That output contains live credentials. This output does not.\n`,
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`Preflight crashed: ${String(error)}\n`)
  process.exit(1)
})
