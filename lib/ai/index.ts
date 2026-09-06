import 'server-only'

import { getEnv } from '@/lib/config/env'
import { createAnthropicProvider } from '@/lib/ai/providers/anthropic'
import { createOpenAiProvider } from '@/lib/ai/providers/openai'
import {
  capabilitiesFor,
  type AiCapabilities,
  type AiProvider,
  type AiProviderName,
} from '@/lib/ai/types'

/**
 * AI provider factory.
 *
 * Returns `null` when the configured provider is `deterministic` — that is not
 * an error state, it is the offline rule-based mode. Callers branch on the null
 * rather than receiving a fake provider that would silently do nothing.
 */

let cached: AiProvider | null | undefined

export function getAiProvider(): AiProvider | null {
  if (cached !== undefined) return cached

  const env = getEnv()

  switch (env.AI_PROVIDER) {
    case 'deterministic':
      cached = null
      break

    case 'anthropic':
      cached = createAnthropicProvider({
        // Validated non-empty by the env schema for non-deterministic providers.
        apiKey: env.AI_API_KEY!,
        model: env.AI_MODEL,
        timeoutMs: env.AI_TIMEOUT_MS,
        maxRepairAttempts: env.AI_MAX_REPAIR_ATTEMPTS,
      })
      break

    case 'openai':
      cached = createOpenAiProvider({
        apiKey: env.AI_API_KEY!,
        model: env.AI_MODEL,
        timeoutMs: env.AI_TIMEOUT_MS,
        maxRepairAttempts: env.AI_MAX_REPAIR_ATTEMPTS,
      })
      break
  }

  return cached ?? null
}

/** Test-only: clears the memoised provider between cases. */
export function resetAiProviderCache(): void {
  cached = undefined
}

export function activeProviderName(): AiProviderName {
  return getEnv().AI_PROVIDER
}

export function activeCapabilities(): AiCapabilities {
  return capabilitiesFor(activeProviderName())
}

export type { AiProvider, AiCapabilities, AiProviderName }
