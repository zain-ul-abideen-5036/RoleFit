/**
 * Structured logger with mandatory redaction.
 *
 * Resumes are sensitive personal data. This logger is the single place that
 * writes to stdout, and it refuses to emit resume text, credentials or tokens:
 * every value is passed through `redact()` before serialization, and long
 * free-text strings are replaced by a length summary rather than truncated
 * (a truncated resume is still personal data).
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const
export type LogLevel = keyof typeof LEVELS

/**
 * Keys whose values are never logged, at any depth. Matched case-insensitively
 * as a substring so `userPassword`, `AI_API_KEY` and `sessionToken` are all
 * covered.
 */
const FORBIDDEN_KEY_PATTERNS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'sessionid',
  'session_id',
  'resumetext',
  'resume_text',
  'rawtext',
  'raw_text',
  'jobdescription',
  'job_description',
  'jdtext',
  'content',
  'bullets',
  'summary',
  'email',
  'phone',
  'address',
  'fullname',
  'full_name',
] as const

/** Free text longer than this is summarized rather than emitted. */
const MAX_LOGGED_STRING = 120

function isForbiddenKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z_]/g, '')
  return FORBIDDEN_KEY_PATTERNS.some((pattern) => normalized.includes(pattern.replace(/_/g, '')))
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[max-depth]'
  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    return value.length > MAX_LOGGED_STRING ? `[text:${value.length}chars]` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function' || typeof value === 'symbol') return '[non-serializable]'

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause ? { cause: redact(value.cause, depth + 1) } : {}),
    }
  }

  if (Array.isArray(value)) {
    if (value.length > 25) return `[array:${value.length}]`
    return value.map((item) => redact(item, depth + 1))
  }

  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return `[binary:${'byteLength' in value ? value.byteLength : 0}bytes]`
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isForbiddenKey(key) ? '[redacted]' : redact(item, depth + 1)
    }
    return out
  }

  return '[unknown]'
}

export interface LogFields {
  [key: string]: unknown
}

function currentLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

function write(level: LogLevel, message: string, fields: LogFields, bindings: LogFields): void {
  if (LEVELS[level] < LEVELS[currentLevel()]) return
  if (process.env.NODE_ENV === 'test' && !process.env.ROLEFIT_LOG_IN_TESTS) return

  const entry = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(redact({ ...bindings, ...fields }) as Record<string, unknown>),
  }

  const line = JSON.stringify(entry)
  if (level === 'error') process.stderr.write(`${line}\n`)
  else process.stdout.write(`${line}\n`)
}

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** Returns a logger that attaches `bindings` to every subsequent entry. */
  child(bindings: LogFields): Logger
}

function create(bindings: LogFields): Logger {
  return {
    debug: (message, fields = {}) => write('debug', message, fields, bindings),
    info: (message, fields = {}) => write('info', message, fields, bindings),
    warn: (message, fields = {}) => write('warn', message, fields, bindings),
    error: (message, fields = {}) => write('error', message, fields, bindings),
    child: (extra) => create({ ...bindings, ...extra }),
  }
}

export const logger: Logger = create({ service: 'rolefit' })
