import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { optimizationProposalSchema } from '@/lib/ai/schemas'
import type { AiProvider } from '@/lib/ai/types'
import type { JobDescriptionProfile, ResumeProfile } from '@/lib/domain/types'
import { AppError } from '@/lib/errors'
import { parseJobDescription } from '@/lib/parsing/job-description-parser'
import { DEMO_JOB_DESCRIPTION_TEXT, demoResumeProfile } from '@/tests/fixtures/demo-data'

/**
 * The analysis and optimization pipeline.
 *
 * The ordering it enforces is the product's central claim: the deterministic
 * engine scores, and only then is a model consulted, and only to rewrite prose.
 * These tests are about what happens when the model misbehaves — returns
 * nothing, throws, or slips something past per-change validation — because
 * those are the paths that decide whether the claim holds.
 */

type Apply = typeof import('@/lib/optimization/apply').validateAndApplyProposal

const { getAiProvider, validateAndApplyProposal, real } = vi.hoisted(() => ({
  getAiProvider: vi.fn(),
  validateAndApplyProposal: vi.fn(),
  // The real implementation, captured inside the mock factory. Re-importing the
  // module here would return the mock itself and the default would recurse.
  real: { apply: null as Apply | null },
}))

vi.mock('@/lib/ai', () => ({ getAiProvider }))

vi.mock('@/lib/optimization/apply', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/optimization/apply')>()
  real.apply = actual.validateAndApplyProposal
  return { ...actual, validateAndApplyProposal }
})

const { analyzeResume, optimizeResume, activePromptVersions } =
  await import('@/lib/optimization/pipeline')

function job(): JobDescriptionProfile {
  return parseJobDescription(DEMO_JOB_DESCRIPTION_TEXT)
}

function providerReturning(proposal: Record<string, unknown>): AiProvider {
  // Parsed through the real schema, because a provider always returns
  // schema-validated data — an unparsed literal would be missing the defaults
  // the pipeline relies on and would test a shape that cannot occur.
  const data = optimizationProposalSchema.parse(proposal)

  return {
    name: 'anthropic',
    model: 'test-model',
    generateStructured: vi.fn(async () => ({
      data,
      usage: { inputTokens: 900, outputTokens: 120 },
      repairAttempts: 0,
      provider: 'anthropic' as const,
      model: 'test-model',
    })) as AiProvider['generateStructured'],
  }
}

async function optimize(resume: ResumeProfile = demoResumeProfile()) {
  const target = job()
  const analysis = analyzeResume(resume, target).report
  return optimizeResume({ resume, job: target, analysis })
}

beforeEach(() => {
  getAiProvider.mockReturnValue(null)
  // Defaults to the real implementation; individual cases override it to
  // simulate per-change validation letting something through.
  validateAndApplyProposal.mockImplementation(real.apply!)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('analyzeResume', () => {
  it('scores without consulting a model at all', () => {
    const result = analyzeResume(demoResumeProfile(), job())

    expect(getAiProvider).not.toHaveBeenCalled()
    expect(result.overallScore).toBeGreaterThan(0)
    expect(result.overallScore).toBeLessThanOrEqual(100)
  })

  it('is deterministic across runs', () => {
    const first = analyzeResume(demoResumeProfile(), job())
    const second = analyzeResume(demoResumeProfile(), job())

    expect(first.overallScore).toBe(second.overallScore)
    expect(first.report.requirementMatches).toEqual(second.report.requirementMatches)
  })

  it('reports the ATS readiness alongside the match score', () => {
    const result = analyzeResume(demoResumeProfile(), job())
    expect(result.ats.checks.length).toBeGreaterThan(0)
  })
})

describe('choosing an engine', () => {
  it('uses the rule-based engine when no provider is configured', async () => {
    getAiProvider.mockReturnValue(null)

    const result = await optimize()

    expect(result.provider).toBe('deterministic')
    expect(result.model).toBeNull()
    expect(result.promptVersion).toBe('rule-based-v1')
    expect(result.usage).toEqual({ inputTokens: null, outputTokens: null })
  })

  it('uses the model when one is configured, and says which', async () => {
    getAiProvider.mockReturnValue(providerReturning({ summary: null }))

    const result = await optimize()

    expect(result.provider).toBe('anthropic')
    expect(result.model).toBe('test-model')
    expect(result.usage).toEqual({ inputTokens: 900, outputTokens: 120 })
  })

  it('falls back to the rule-based engine when the model throws', async () => {
    getAiProvider.mockReturnValue({
      name: 'anthropic',
      model: 'test-model',
      generateStructured: vi.fn().mockRejectedValue(new Error('upstream exploded')),
    })

    // A degraded optimization is far better than a failed one.
    const result = await optimize()

    expect(result.provider).toBe('deterministic')
    expect(result.model).toBeNull()
  })

  it('reports the deterministic engine after a fallback, never the model that failed', async () => {
    // The UI tells the user which engine produced their result. Reporting
    // 'anthropic' here would be a lie about where the text came from.
    getAiProvider.mockReturnValue({
      name: 'openai',
      model: 'gpt-test',
      generateStructured: vi.fn().mockRejectedValue(new Error('timeout')),
    })

    const result = await optimize()

    expect(result.provider).toBe('deterministic')
    expect(result.promptVersion).toBe('rule-based-v1')
    expect(result.usage.inputTokens).toBeNull()
  })

  it('does not let a provider failure fail the optimization', async () => {
    getAiProvider.mockReturnValue({
      name: 'anthropic',
      model: 'test-model',
      generateStructured: vi.fn().mockRejectedValue(new Error('network down')),
    })

    await expect(optimize()).resolves.toMatchObject({ provider: 'deterministic' })
  })
})

describe('the immutable-section backstop', () => {
  it('refuses the whole optimization when an employer changed', async () => {
    const resume = demoResumeProfile()

    // Simulates per-change validation letting something through. The backstop
    // exists precisely for what the per-change checks miss.
    validateAndApplyProposal.mockReturnValue({
      proposedProfile: {
        ...resume,
        experience: resume.experience.map((entry, index) =>
          index === 0 ? { ...entry, company: 'A Company That Never Employed Them' } : entry,
        ),
      },
      changeSet: { changes: [] },
      rejected: [],
    })

    const error = await optimize(resume).catch((caught: unknown) => caught)

    expect(AppError.isAppError(error)).toBe(true)
    expect((error as AppError).code).toBe('AI_INVALID_OUTPUT')
  })

  it('refuses when a degree changed', async () => {
    const resume = demoResumeProfile()

    validateAndApplyProposal.mockReturnValue({
      proposedProfile: {
        ...resume,
        education: resume.education.map((entry) => ({ ...entry, degree: 'PhD Astrophysics' })),
      },
      changeSet: { changes: [] },
      rejected: [],
    })

    const error = await optimize(resume).catch((caught: unknown) => caught)
    expect((error as AppError).code).toBe('AI_INVALID_OUTPUT')
  })

  it('throws rather than returning a partially trusted result', async () => {
    // Returning the changeSet with a warning would put the decision in front of
    // a user who has no way to judge it. Failing closed is the only safe option.
    const resume = demoResumeProfile()

    validateAndApplyProposal.mockReturnValue({
      proposedProfile: {
        ...resume,
        certifications: [
          {
            id: 'cert-invented',
            name: 'Certified Kubernetes Administrator',
            issuer: null,
            issued: null,
            expires: null,
            credentialId: null,
          },
        ],
      },
      changeSet: { changes: [] },
      rejected: [],
    })

    await expect(optimize(resume)).rejects.toBeInstanceOf(AppError)
  })

  it('passes when nothing immutable moved', async () => {
    await expect(optimize()).resolves.toBeDefined()
  })
})

describe('the projected result', () => {
  it('recomputes the score against the proposed profile', async () => {
    const result = await optimize()

    expect(result.projectedScore).toBeGreaterThan(0)
    expect(result.projectedScore).toBeLessThanOrEqual(100)
  })

  it('scores the projection using our own generator signals', async () => {
    // The generated document is single-column, table-free and text-based by
    // construction, so the projection must not inherit the uploaded file's
    // layout penalties.
    const result = await optimize()

    const layoutChecks = result.projectedAts.checks.filter((check) =>
      ['columns', 'tables', 'text_boxes', 'images'].includes(check.id),
    )
    for (const check of layoutChecks) {
      expect(check.status, check.id).not.toBe('fail')
    }
  })

  it('returns a proposed profile that keeps every role', async () => {
    const resume = demoResumeProfile()
    const result = await optimize(resume)

    expect(result.proposedProfile.experience).toHaveLength(resume.experience.length)
  })

  it('surfaces rejected changes for logging', async () => {
    const result = await optimize()
    expect(Array.isArray(result.rejected)).toBe(true)
  })
})

describe('activePromptVersions', () => {
  it('names a version for every prompt a run could use', () => {
    const versions = activePromptVersions()

    expect(Object.keys(versions).sort()).toEqual(['extraction', 'jdAnalysis', 'optimization'])
    for (const [name, version] of Object.entries(versions)) {
      // Recorded on every run, so an output can be traced to the prompt that
      // produced it after the prompt has moved on.
      expect(version, name).toMatch(/\S/)
    }
  })
})
