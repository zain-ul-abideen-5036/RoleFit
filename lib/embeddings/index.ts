import 'server-only'

import { getEnv } from '@/lib/config/env'
import { createOpenAiEmbeddingProvider } from '@/lib/embeddings/openai'
import type { EmbeddingProvider, EmbeddingProviderName } from '@/lib/embeddings/types'

/**
 * Embedding provider factory.
 *
 * Returns `null` when `EMBEDDINGS_PROVIDER=none`, which is the default. That is
 * not a degraded mode: embeddings are used only to suggest the closest thing a
 * resume already says to a requirement it does not meet. Without them the gap
 * list is exactly what it was, minus that one advisory line.
 *
 * Nothing here influences a score, a match decision, or whether a requirement
 * counts as met. Those stay lexical and deterministic — see
 * docs/architecture.md.
 */

let cached: EmbeddingProvider | null | undefined

export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (cached !== undefined) return cached

  const env = getEnv()

  switch (env.EMBEDDINGS_PROVIDER) {
    case 'none':
      cached = null
      break

    case 'openai':
      cached = createOpenAiEmbeddingProvider({
        // Validated non-empty by the env schema for this provider.
        apiKey: env.EMBEDDINGS_API_KEY!,
        model: env.EMBEDDINGS_MODEL,
      })
      break
  }

  return cached ?? null
}

export function embeddingsAreConfigured(): boolean {
  return getEmbeddingProvider() !== null
}

/** Test-only: clears the memoised provider between cases. */
export function resetEmbeddingProviderCache(): void {
  cached = undefined
}

export type { EmbeddingProvider, EmbeddingProviderName }
