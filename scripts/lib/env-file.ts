import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Reading a `.env` file from a plain Node script.
 *
 * Next.js loads these itself; a standalone script does not get that for free,
 * and pulling in dotenv for `KEY=value` plus comments plus optional quotes
 * would be a dependency doing less than this file.
 */

export const PRODUCTION_ENV_FILE = '.env.production.local'

export function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const equals = line.indexOf('=')
    if (equals === -1) continue

    const key = line.slice(0, equals).trim()
    let value = line.slice(equals + 1).trim()

    // Strip one layer of matching quotes. Done before any comment handling,
    // because a database password can legitimately contain '#'.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }

    if (key) values[key] = value
  }

  return values
}

export function readEnvFile(path: string): Record<string, string> {
  return parseEnvFile(readFileSync(resolve(process.cwd(), path), 'utf8'))
}

/**
 * Copies values from an env file into `process.env`, without overwriting.
 *
 * Existing variables win, so an explicit `DATABASE_URL=… npm run …` still
 * takes precedence over the file — which is what someone reaching for that
 * form expects.
 *
 * Returns the keys it actually applied, so a caller can say where the value
 * came from rather than leaving the operator guessing.
 */
export function loadEnvFileIfPresent(path = PRODUCTION_ENV_FILE): string[] {
  const full = resolve(process.cwd(), path)
  if (!existsSync(full)) return []

  const applied: string[] = []
  for (const [key, value] of Object.entries(parseEnvFile(readFileSync(full, 'utf8')))) {
    if (process.env[key] !== undefined && process.env[key] !== '') continue
    if (!value) continue
    process.env[key] = value
    applied.push(key)
  }

  return applied
}

/**
 * Replaces one variable's value, leaving the rest of the file byte-identical.
 *
 * Exists for rotating `AUTH_SECRET` after a leak. Rewriting the file from the
 * template would also be a way to get a new secret, and it is the wrong one:
 * it discards every credential the operator filled in, so the tool for
 * responding to a leak would hand them a blank file at the worst moment.
 *
 * Comments, blank lines, ordering and unrelated values are preserved, because
 * this file is meant to stay readable after the tool has touched it. Returns
 * null when the key is not present, so a caller can refuse rather than silently
 * append a variable to a file that was not what it expected.
 */
export function replaceEnvValue(
  contents: string,
  key: string,
  value: string,
): { contents: string; replaced: number } | null {
  let replaced = 0

  const updated = contents.split(/\r?\n/).map((line) => {
    // Anchored to the start, so a key appearing inside a comment or inside
    // another value is left alone.
    const match = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=)/.exec(line)
    if (!match || match[2] !== key) return line

    replaced += 1
    return `${match[1] ?? ''}${key}=${value}`
  })

  if (replaced === 0) return null

  return { contents: updated.join('\n'), replaced }
}
