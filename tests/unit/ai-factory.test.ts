import { afterEach, describe, expect, it } from 'vitest'

import {
  activeCapabilities,
  activeProviderName,
  getAiProvider,
  resetAiProviderCache,
} from '@/lib/ai'
import { capabilitiesFor } from '@/lib/ai/types'
import { resetEnvCache } from '@/lib/config/env'

/**
 * The AI provider factory.
 *
 * `null` is not an error here — it is the offline rule-based mode, and callers
 * branch on it. The distinction matters: a stub provider that silently did
 * nothing would let the app claim an LLM produced a result it did not.
 *
 * The capability flags exist so the UI can be honest about which engine ran and
 * whether anything left the machine, which is the one thing a user cannot
 * check for themselves.
 */

const ORIGINAL_ENV = { ...process.env }

function setEnv(values: Record<string, string | undefined>): void {
  const env = process.env as Record<string, string | undefined>
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  resetEnvCache()
  resetAiProviderCache()
}

afterEach(() => {
  const env = process.env as Record<string, string | undefined>
  for (const key of Object.keys(env)) {
    if (!(key in ORIGINAL_ENV)) delete env[key]
  }
  Object.assign(env, ORIGINAL_ENV)
  resetEnvCache()
  resetAiProviderCache()
})

describe('the deterministic default', () => {
  it('returns null rather than a stub that pretends to work', () => {
    setEnv({ AI_PROVIDER: 'deterministic' })

    // A stub would let a caller report that a model ran when none did.
    expect(getAiProvider()).toBeNull()
  })

  it('needs no API key', () => {
    setEnv({ AI_PROVIDER: 'deterministic', AI_API_KEY: undefined })
    expect(() => getAiProvider()).not.toThrow()
  })

  it('reports that it cannot rewrite prose and sends nothing anywhere', () => {
    setEnv({ AI_PROVIDER: 'deterministic' })

    expect(activeCapabilities()).toEqual({
      canRewriteProse: false,
      sendsDataToThirdParty: false,
    })
  })
})

describe('a configured provider', () => {
  it.each(['anthropic', 'openai'] as const)('builds the %s provider', (name) => {
    setEnv({ AI_PROVIDER: name, AI_API_KEY: 'PLACEHOLDER_KEY' })

    const provider = getAiProvider()
    expect(provider).not.toBeNull()
    expect(provider?.name).toBe(name)
  })

  it.each(['anthropic', 'openai'] as const)('refuses %s without a key', (name) => {
    setEnv({ AI_PROVIDER: name, AI_API_KEY: undefined })

    // Failing at startup rather than on the first optimization, which is when
    // a missing key would otherwise surface.
    expect(() => getAiProvider()).toThrowError(/AI_API_KEY/)
  })

  it('passes a model override through', () => {
    setEnv({
      AI_PROVIDER: 'anthropic',
      AI_API_KEY: 'PLACEHOLDER_KEY',
      AI_MODEL: 'claude-test-model',
    })

    expect(getAiProvider()?.model).toBe('claude-test-model')
  })

  it('falls back to a default model when none is given', () => {
    setEnv({ AI_PROVIDER: 'openai', AI_API_KEY: 'PLACEHOLDER_KEY', AI_MODEL: undefined })

    expect(getAiProvider()?.model).toMatch(/\S/)
  })

  it('says plainly that data leaves the machine', () => {
    setEnv({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'PLACEHOLDER_KEY' })

    // Drives the privacy notice. A user cannot check this for themselves, so
    // getting it wrong is a lie rather than a bug.
    expect(activeCapabilities()).toEqual({
      canRewriteProse: true,
      sendsDataToThirdParty: true,
    })
  })
})

describe('memoisation', () => {
  it('returns the same instance across calls', () => {
    setEnv({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'PLACEHOLDER_KEY' })

    // A warm serverless instance reuses this; rebuilding per request would
    // discard any connection state the SDK holds.
    expect(getAiProvider()).toBe(getAiProvider())
  })

  it('caches the null case too, rather than re-reading configuration', () => {
    setEnv({ AI_PROVIDER: 'deterministic' })

    expect(getAiProvider()).toBeNull()
    expect(getAiProvider()).toBeNull()
  })

  it('picks up a change after the cache is reset', () => {
    setEnv({ AI_PROVIDER: 'deterministic' })
    expect(getAiProvider()).toBeNull()

    setEnv({ AI_PROVIDER: 'openai', AI_API_KEY: 'PLACEHOLDER_KEY' })
    expect(getAiProvider()?.name).toBe('openai')
  })
})

describe('activeProviderName', () => {
  it.each(['deterministic', 'anthropic', 'openai'] as const)('reports %s', (name) => {
    setEnv({ AI_PROVIDER: name, AI_API_KEY: 'PLACEHOLDER_KEY' })
    expect(activeProviderName()).toBe(name)
  })

  it('reports the configured provider even before one is built', () => {
    setEnv({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'PLACEHOLDER_KEY' })

    // Read by server components that never call the provider.
    expect(activeProviderName()).toBe('anthropic')
  })
})

describe('capabilitiesFor', () => {
  it('treats only the deterministic engine as local', () => {
    expect(capabilitiesFor('deterministic').sendsDataToThirdParty).toBe(false)
    expect(capabilitiesFor('anthropic').sendsDataToThirdParty).toBe(true)
    expect(capabilitiesFor('openai').sendsDataToThirdParty).toBe(true)
  })

  it('treats only the deterministic engine as unable to rewrite prose', () => {
    expect(capabilitiesFor('deterministic').canRewriteProse).toBe(false)
    expect(capabilitiesFor('anthropic').canRewriteProse).toBe(true)
  })

  it('never reports a provider as both local and prose-capable', () => {
    // The two travel together by construction. A provider that could rewrite
    // prose without sending anything anywhere does not exist here, and
    // claiming otherwise would understate what a user is agreeing to.
    for (const name of ['deterministic', 'anthropic', 'openai'] as const) {
      const capabilities = capabilitiesFor(name)
      expect(capabilities.canRewriteProse, name).toBe(capabilities.sendsDataToThirdParty)
    }
  })
})
