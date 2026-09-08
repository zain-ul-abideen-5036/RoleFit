/**
 * Writes `.env.production.local` from the committed template.
 *
 * Everything that can be decided without an account is already decided in the
 * template. This fills in the one value that must be unique per deployment —
 * `AUTH_SECRET` — and leaves the credentials that only exist inside somebody's
 * Neon, Backblaze and Upstash dashboards.
 *
 * The secret is generated here rather than committed in the template because a
 * secret in version control is a secret that has leaked. The output file is
 * gitignored.
 *
 *   npm run deploy:init
 *
 * Refuses to overwrite an existing file unless `--force` is passed. Overwriting
 * would regenerate `AUTH_SECRET` and sign out every existing session, which is
 * not something to do by accident.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TEMPLATE = '.env.production.template'
const OUTPUT = '.env.production.local'
const PLACEHOLDER = '__GENERATED_BY_DEPLOY_INIT__'

/** Variables the operator has to supply, in the order the template lists them. */
const BLANKS = [
  ['DATABASE_URL', 'Neon — the POOLED connection string'],
  ['STORAGE_ENDPOINT', 'Backblaze — https:// + the bucket Endpoint line'],
  ['STORAGE_REGION', 'Backblaze — the region inside that endpoint'],
  ['STORAGE_ACCESS_KEY', 'Backblaze — application key keyID'],
  ['STORAGE_SECRET_KEY', 'Backblaze — application key applicationKey'],
  ['STORAGE_BUCKET', 'Backblaze — your bucket name'],
  ['UPSTASH_REDIS_REST_URL', 'Upstash — REST URL'],
  ['UPSTASH_REDIS_REST_TOKEN', 'Upstash — REST token'],
] as const

function main(): void {
  const templatePath = resolve(process.cwd(), TEMPLATE)
  const outputPath = resolve(process.cwd(), OUTPUT)
  const force = process.argv.includes('--force')

  if (!existsSync(templatePath)) {
    process.stderr.write(`Missing ${TEMPLATE}. Are you in the project root?\n`)
    process.exit(1)
  }

  if (existsSync(outputPath) && !force) {
    process.stderr.write(
      `${OUTPUT} already exists.\n\n` +
        `Leaving it alone: regenerating AUTH_SECRET would sign out every\n` +
        `existing session. Pass --force if that is what you want.\n`,
    )
    process.exit(1)
  }

  const template = readFileSync(templatePath, 'utf8')

  if (!template.includes(PLACEHOLDER)) {
    process.stderr.write(
      `${TEMPLATE} does not contain the AUTH_SECRET placeholder.\n` +
        `Refusing to write a file whose secret may not have been generated.\n`,
    )
    process.exit(1)
  }

  // 48 bytes, base64url: 64 characters, comfortably past the 32-character
  // minimum, and URL-safe so it survives being pasted anywhere.
  const secret = randomBytes(48).toString('base64url')

  writeFileSync(outputPath, template.replace(PLACEHOLDER, secret), { mode: 0o600 })

  process.stdout.write(`Wrote ${OUTPUT}\n\n`)
  process.stdout.write(`AUTH_SECRET generated (${secret.length} characters). Not printed here.\n`)
  process.stdout.write(`The file is gitignored; do not commit it.\n\n`)
  process.stdout.write(`Now fill in these ${BLANKS.length} values:\n\n`)

  for (const [key, where] of BLANKS) {
    process.stdout.write(`  ${key.padEnd(26)} ${where}\n`)
  }

  process.stdout.write(`\nThen check them for real:\n\n  npm run deploy:preflight\n`)
}

main()
