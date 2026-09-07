import { AppError, ERROR_CODES } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Shared HTTP behaviour for remote AI providers.
 *
 * Two concerns live here so no provider has to reimplement them: a hard
 * timeout (a hung upstream must not hold a serverless function open until the
 * platform kills it), and retries limited to failures that are actually
 * transient.
 */

/** Status codes worth retrying. 4xx other than 429 will fail again identically. */
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504])

export interface PostJsonOptions {
  url: string
  headers: Record<string, string>
  body: unknown
  timeoutMs: number
  maxAttempts?: number
  /** Provider name, for log correlation only. */
  provider: string
}

export async function postJson<TResponse>(options: PostJsonOptions): Promise<TResponse> {
  const maxAttempts = options.maxAttempts ?? 3
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)

    try {
      const response = await fetch(options.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...options.headers },
        body: JSON.stringify(options.body),
        signal: controller.signal,
      })

      if (response.ok) {
        return (await response.json()) as TResponse
      }

      // The body may carry provider diagnostics. It is logged, never surfaced:
      // an upstream error message can echo prompt content.
      const detail = await response.text().catch(() => '')
      logger.warn('ai.http_error', {
        provider: options.provider,
        status: response.status,
        attempt,
        detailLength: detail.length,
      })

      if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxAttempts) {
        throw new AppError(ERROR_CODES.AI_UNAVAILABLE, {
          context: { provider: options.provider, status: response.status },
        })
      }

      await backoff(attempt, response.headers.get('retry-after'))
      continue
    } catch (error) {
      if (AppError.isAppError(error)) throw error

      const isAbort = (error as { name?: string } | null)?.name === 'AbortError'
      lastError = error
      logger.warn('ai.request_failed', {
        provider: options.provider,
        attempt,
        reason: isAbort ? 'timeout' : 'network',
      })

      if (attempt === maxAttempts) break
      await backoff(attempt, null)
    } finally {
      clearTimeout(timer)
    }
  }

  throw new AppError(ERROR_CODES.AI_UNAVAILABLE, {
    cause: lastError,
    context: { provider: options.provider },
  })
}

/** Exponential backoff with jitter, honouring Retry-After when present. */
async function backoff(attempt: number, retryAfter: string | null): Promise<void> {
  const headerSeconds = retryAfter ? Number.parseFloat(retryAfter) : Number.NaN
  const base = Number.isFinite(headerSeconds)
    ? Math.min(headerSeconds * 1000, 10_000)
    : Math.min(2 ** attempt * 250, 4000)

  const jitter = Math.random() * 250
  await new Promise((resolve) => setTimeout(resolve, base + jitter))
}

/**
 * Extracts the first JSON object from a model response.
 *
 * Models sometimes wrap JSON in prose or a fenced code block despite being told
 * not to. Recovering the object is preferable to discarding a correct answer
 * over its packaging; the result is still schema-validated afterwards.
 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()

  const direct = tryParse(trimmed)
  if (direct !== undefined) return direct

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed)
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim())
    if (parsed !== undefined) return parsed
  }

  // Fall back to the outermost balanced braces.
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end > start) {
    const parsed = tryParse(trimmed.slice(start, end + 1))
    if (parsed !== undefined) return parsed
  }

  throw new AppError(ERROR_CODES.AI_INVALID_OUTPUT, {
    context: { reason: 'no_json_found', responseLength: text.length },
  })
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
