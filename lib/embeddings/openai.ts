import 'server-only'

import { AppError, ERROR_CODES } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type { EmbeddingProvider } from '@/lib/embeddings/types'

/**
 * OpenAI embeddings.
 *
 * `text-embedding-3-small` by default: 1536 dimensions, and the cheapest model
 * that is worth using. The output here never influences a score, so paying for
 * a larger model would buy a marginally better ordering of an advisory list.
 */

const ENDPOINT = 'https://api.openai.com/v1/embeddings'
const DEFAULT_MODEL = 'text-embedding-3-small'
const DEFAULT_DIMENSIONS = 1536

/** Inputs per request. Beyond this the request body starts to get unwieldy. */
const MAX_BATCH = 96

export interface OpenAiEmbeddingConfig {
  apiKey: string
  model?: string | undefined
  timeoutMs?: number | undefined
}

interface EmbeddingResponse {
  data?: { index?: number; embedding?: number[] }[]
}

export function createOpenAiEmbeddingProvider(config: OpenAiEmbeddingConfig): EmbeddingProvider {
  const model = config.model?.trim() || DEFAULT_MODEL
  const timeoutMs = config.timeoutMs ?? 20_000

  async function embedBatch(texts: readonly string[]): Promise<number[][]> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, input: texts }),
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (cause) {
      logger.error('embeddings.transport_failed', { provider: 'openai' })
      throw new AppError(ERROR_CODES.AI_UNAVAILABLE, { cause })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      // Status only. A provider error body echoes the request, which here is
      // resume text.
      logger.error('embeddings.rejected', { provider: 'openai', status: response.status })
      throw new AppError(ERROR_CODES.AI_UNAVAILABLE)
    }

    const body = (await response.json()) as EmbeddingResponse
    const rows = body.data ?? []

    // The API documents that order is not guaranteed, so vectors are placed by
    // their reported index rather than by arrival. Pairing by arrival order
    // would silently attach one requirement's vector to another's text.
    const vectors: (number[] | undefined)[] = new Array(texts.length).fill(undefined)
    for (const row of rows) {
      if (typeof row.index !== 'number' || !Array.isArray(row.embedding)) continue
      if (row.index < 0 || row.index >= texts.length) continue
      vectors[row.index] = row.embedding
    }

    const missing = vectors.findIndex((vector) => vector === undefined)
    if (missing !== -1) {
      // Fail rather than return a short or gappy array: a caller pairing
      // vectors back to inputs by index cannot detect the gap.
      logger.error('embeddings.incomplete_response', { provider: 'openai', expected: texts.length })
      throw new AppError(ERROR_CODES.AI_INVALID_OUTPUT)
    }

    return vectors as number[][]
  }

  return {
    name: 'openai',
    model,
    dimensions: DEFAULT_DIMENSIONS,

    async embed(texts: readonly string[]): Promise<number[][]> {
      if (texts.length === 0) return []

      const out: number[][] = []
      for (let start = 0; start < texts.length; start += MAX_BATCH) {
        out.push(...(await embedBatch(texts.slice(start, start + MAX_BATCH))))
      }
      return out
    },
  }
}
