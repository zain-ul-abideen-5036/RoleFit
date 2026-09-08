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
