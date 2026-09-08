import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetEnvCache } from '@/lib/config/env'
import { embeddingsAreConfigured, resetEmbeddingProviderCache } from '@/lib/embeddings'
import { SUGGESTION_FLOOR, suggestGapBridges } from '@/lib/embeddings/gap-suggestions'
import { createOpenAiEmbeddingProvider } from '@/lib/embeddings/openai'
import { cosineSimilarity, rankBySimilarity, toDisplayScore } from '@/lib/embeddings/similarity'
import type { EmbeddingProvider } from '@/lib/embeddings/types'
import type { RequirementMatch, ResumeProfile } from '@/lib/domain/types'
import { emptyResumeProfile } from '@/lib/domain/types'

/**
 * Embeddings.
 *
 * No embedding API is called. What is tested is the arithmetic, the ordering,
 * and — most importantly — the boundaries: that a suggestion is only ever
 * offered for a requirement the lexical engine reported as missing, that it
 * never changes a status or a score, and that losing the provider entirely
 * costs nothing but the suggestion.
 */

const ORIGINAL_ENV = { ...process.env }

function setEnv(values: Record<string, string | undefined>): void {
  const env = process.env as Record<string, string | undefined>
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  resetEnvCache()
  resetEmbeddingProviderCache()
}

afterEach(() => {
  const env = process.env as Record<string, string | undefined>
  for (const key of Object.keys(env)) {
    if (!(key in ORIGINAL_ENV)) delete env[key]
  }
  Object.assign(env, ORIGINAL_ENV)
  resetEnvCache()
  resetEmbeddingProviderCache()
  vi.unstubAllGlobals()
})

describe('cosineSimilarity', () => {
  it('is 1 for identical direction', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
    // Magnitude is irrelevant; only direction counts.
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
  })

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('is -1 for opposite direction', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1)
  })

  it('is 0 rather than NaN for a zero vector', () => {
    // An all-zero embedding means the provider had nothing to work with, and
    // "unrelated" is the honest reading of that.
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0)
  })

  it('is 0 for mismatched lengths rather than comparing a prefix', () => {
    // Two different models produce different dimensions. Silently comparing
    // the overlap would return a plausible number for incomparable vectors.
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0)
  })

  it('is 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })

  it('is symmetric', () => {
    const a = [0.4, -0.2, 0.9]
    const b = [0.1, 0.8, -0.3]
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a))
  })
})

describe('toDisplayScore', () => {
  it('maps the cosine range onto 0-1', () => {
    expect(toDisplayScore(-1)).toBe(0)
    expect(toDisplayScore(0)).toBe(0.5)
    expect(toDisplayScore(1)).toBe(1)
  })

  it('clamps values outside the range', () => {
    expect(toDisplayScore(-3)).toBe(0)
    expect(toDisplayScore(7)).toBe(1)
  })
})

describe('rankBySimilarity', () => {
  const candidates = [
    { item: 'far', vector: [0, 1] },
    { item: 'near', vector: [1, 0.05] },
    { item: 'middling', vector: [1, 1] },
  ]

  it('orders best first', () => {
    const ranked = rankBySimilarity([1, 0], candidates, { minSimilarity: -1, limit: 3 })
    expect(ranked.map((entry) => entry.item)).toEqual(['near', 'middling', 'far'])
  })

  it('drops anything below the floor', () => {
    const ranked = rankBySimilarity([1, 0], candidates, { minSimilarity: 0.9, limit: 3 })
    expect(ranked.map((entry) => entry.item)).toEqual(['near'])
  })

  it('respects the limit', () => {
    expect(rankBySimilarity([1, 0], candidates, { minSimilarity: -1, limit: 1 })).toHaveLength(1)
  })

  it('returns nothing when everything is below the floor', () => {
    // The alternative — returning the least-bad of a set of unrelated things —
    // is what the mandatory floor exists to prevent.
    expect(rankBySimilarity([1, 0], candidates, { minSimilarity: 0.999, limit: 3 })).toEqual([])
  })

  it('returns nothing for no candidates', () => {
    expect(rankBySimilarity([1, 0], [], { minSimilarity: 0, limit: 3 })).toEqual([])
  })
})

describe('the provider factory', () => {
  it('is off by default', () => {
    setEnv({ EMBEDDINGS_PROVIDER: undefined, EMBEDDINGS_API_KEY: undefined })
    expect(embeddingsAreConfigured()).toBe(false)
  })

  it('refuses to start without a key when a provider is selected', () => {
    setEnv({ EMBEDDINGS_PROVIDER: 'openai', EMBEDDINGS_API_KEY: undefined })
    expect(() => embeddingsAreConfigured()).toThrowError(/EMBEDDINGS_API_KEY/)
  })

  it('is on when configured', () => {
    setEnv({ EMBEDDINGS_PROVIDER: 'openai', EMBEDDINGS_API_KEY: 'PLACEHOLDER_KEY' })
    expect(embeddingsAreConfigured()).toBe(true)
  })
})

describe('the OpenAI adapter', () => {
  function provider(): EmbeddingProvider {
    return createOpenAiEmbeddingProvider({ apiKey: 'PLACEHOLDER_KEY' })
  }

  it('returns one vector per input', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { index: 0, embedding: [1, 0] },
            { index: 1, embedding: [0, 1] },
          ],
        }),
      }),
    )

    expect(await provider().embed(['a', 'b'])).toEqual([
      [1, 0],
      [0, 1],
    ])
  })

  it('places vectors by the reported index, not by arrival order', async () => {
    // The API does not guarantee order. Pairing by arrival would attach one
    // requirement's vector to another's text — plausible, wrong output.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
      }),
    )

    expect(await provider().embed(['first', 'second'])).toEqual([
      [1, 0],
      [0, 1],
    ])
  })

  it('throws on an incomplete response rather than returning a gappy array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ index: 0, embedding: [1, 0] }] }),
      }),
    )

    // A caller pairing vectors to inputs by index cannot detect a gap.
    await expect(provider().embed(['a', 'b'])).rejects.toBeDefined()
  })

  it('makes no request at all for no inputs', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await provider().embed([])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces an upstream rejection without leaking the response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))

    const error = await provider()
      .embed(['a'])
      .catch((caught: unknown) => caught)

    expect(String(error)).not.toContain('PLACEHOLDER_KEY')
  })

  it('batches a large input set', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { input: string[] }
      return {
        ok: true,
        json: async () => ({
          data: body.input.map((_text, index) => ({ index, embedding: [1, 0] })),
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const vectors = await provider().embed(Array.from({ length: 200 }, (_, i) => `text ${i}`))

    expect(vectors).toHaveLength(200)
    // 200 inputs at 96 per request.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('gap suggestions', () => {
  function resume(): ResumeProfile {
    return {
      ...emptyResumeProfile(),
      experience: [
        {
          id: 'exp-1',
          title: 'Engineer',
          company: 'Acme',
          location: null,
          dates: { start: '2020-01', end: null, isCurrent: true },
          bullets: ['Ran the container platform on ECS across twelve services'],
        },
      ],
    }
  }

  function match(overrides: Partial<RequirementMatch>): RequirementMatch {
    return {
      requirementId: 'req-1',
      text: 'Kubernetes',
      canonical: 'kubernetes',
      priority: 'required',
      category: 'skill',
      status: 'missing',
      confidence: 0,
      method: 'none',
      evidence: [],
      ...overrides,
    } as RequirementMatch
  }

  /**
   * Sizes itself to the input and discriminates by content, so the ranking is
   * actually exercised rather than resolved by array order.
   *
   * Requirements come first in the batch, so index 0 is the requirement.
   * Spans whose text contains `nearText` get a vector aligned with it; every
   * other span gets an orthogonal one.
   */
  function fakeProvider(nearText: string | null): EmbeddingProvider {
    return {
      name: 'openai',
      model: 'test',
      dimensions: 2,
      embed: vi.fn(async (texts: readonly string[]) =>
        texts.map((text, index) => {
          if (index === 0) return [1, 0]
          if (nearText === null) return [0, 1]
          return text.includes(nearText) ? [1, 0.01] : [0, 1]
        }),
      ),
    }
  }

  /** Returns fewer vectors than it was asked for. */
  function shortProvider(): EmbeddingProvider {
    return {
      name: 'openai',
      model: 'test',
      dimensions: 2,
      embed: vi.fn(async () => [[1, 0]]),
    }
  }

  it('suggests the closest span for a missing requirement', async () => {
    const suggestions = await suggestGapBridges({
      resume: resume(),
      matches: [match({})],
      // Only the bullet is near; the title and company spans are orthogonal.
      provider: fakeProvider('container platform'),
    })

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]?.requirementId).toBe('req-1')
    expect(suggestions[0]?.excerpt).toContain('container platform')
  })

  it('quotes the resume verbatim rather than paraphrasing', async () => {
    const profile = resume()
    const suggestions = await suggestGapBridges({
      resume: profile,
      matches: [match({})],
      provider: fakeProvider('container platform'),
    })

    expect(suggestions).toHaveLength(1)
    expect(profile.experience[0]?.bullets).toContain(suggestions[0]?.excerpt)
  })

  it('offers nothing when the closest span is below the floor', async () => {
    const suggestions = await suggestGapBridges({
      resume: resume(),
      matches: [match({})],
      // Nothing is near: every span is orthogonal, similarity 0.
      provider: fakeProvider(null),
    })

    expect(suggestions).toEqual([])
  })

  it('ignores requirements the lexical engine already evidenced', async () => {
    const embed = vi.fn(async (texts: readonly string[]) => texts.map(() => [1, 0]))

    const suggestions = await suggestGapBridges({
      resume: resume(),
      matches: [match({ status: 'strong', method: 'exact' })],
      provider: { name: 'openai', model: 'test', dimensions: 2, embed },
    })

    // Nothing to suggest, and nothing embedded — a met requirement needs no
    // suggestion, and offering one would imply the signals are combined.
    expect(suggestions).toEqual([])
    expect(embed).not.toHaveBeenCalled()
  })

  it('returns nothing rather than throwing when the provider fails', async () => {
    const suggestions = await suggestGapBridges({
      resume: resume(),
      matches: [match({})],
      provider: {
        name: 'openai',
        model: 'test',
        dimensions: 2,
        embed: vi.fn().mockRejectedValue(new Error('rate limited')),
      },
    })

    // Advisory: losing it must never fail the analysis that carries it.
    expect(suggestions).toEqual([])
  })

  it('returns nothing when the provider returns the wrong number of vectors', async () => {
    const suggestions = await suggestGapBridges({
      resume: resume(),
      matches: [match({})],
      provider: shortProvider(),
    })

    expect(suggestions).toEqual([])
  })

  it('returns nothing for a resume with no spans', async () => {
    const embed = vi.fn()
    const suggestions = await suggestGapBridges({
      resume: emptyResumeProfile(),
      matches: [match({})],
      provider: { name: 'openai', model: 'test', dimensions: 2, embed },
    })

    expect(suggestions).toEqual([])
    expect(embed).not.toHaveBeenCalled()
  })

  it('caps how many requirements it will embed', async () => {
    const matches = Array.from({ length: 60 }, (_, index) =>
      match({ requirementId: `req-${index}` }),
    )
    const embed = vi.fn(async (texts: readonly string[]) => texts.map(() => [1, 0]))

    await suggestGapBridges({
      resume: resume(),
      matches,
      provider: { name: 'openai', model: 'test', dimensions: 2, embed },
      maxRequirements: 5,
    })

    const embedded = embed.mock.calls[0]![0]
    // 5 requirements plus the resume's spans, not 60 plus.
    expect(embedded.length).toBeLessThan(60)
  })

  it('keeps the floor high enough to mean something', () => {
    // Unrelated short texts sit around 0.1-0.2 on text-embedding-3-small.
    expect(SUGGESTION_FLOOR).toBeGreaterThan(0.3)
    expect(SUGGESTION_FLOOR).toBeLessThan(1)
  })
})
