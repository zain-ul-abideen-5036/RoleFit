import 'server-only'

import { getAiProvider } from '@/lib/ai'
import type { AiProviderName } from '@/lib/ai/types'
import { analyzeAtsReadiness, generatedDocumentSignals } from '@/lib/ats/analyzer'
import type { AtsReport, SourceDocumentSignals } from '@/lib/ats/types'
import { emptySourceSignals } from '@/lib/ats/types'
import type { AnalysisReport, JobDescriptionProfile, ResumeProfile } from '@/lib/domain/types'
import { AppError, ERROR_CODES } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { matchResumeToJob } from '@/lib/matching/matcher'
import { buildAnalysisReport } from '@/lib/matching/scoring'
import { validateAndApplyProposal, type RejectedChange } from '@/lib/optimization/apply'
import { proposeLlmOptimization } from '@/lib/optimization/llm'
import { proposeRuleBasedOptimization } from '@/lib/optimization/rule-based'
import { verifyImmutableSections } from '@/lib/optimization/anti-fabrication'
import type { ChangeSet } from '@/lib/optimization/types'
import { PROMPTS } from '@/prompts'

/**
 * The analysis and optimization pipeline.
 *
 * Deliberate ordering: the deterministic engine runs first and produces the
 * score, the requirement matches and the gap list. Only then is a model
 * consulted, and only to rewrite prose. The model never influences a score, a
 * match decision, or whether a requirement counts as met.
 */

/* ==========================================================================
   Analysis
   ========================================================================== */

export interface AnalysisResult {
  report: AnalysisReport
  ats: AtsReport
  overallScore: number
}

/** Scores a resume against a job description. No model is involved. */
export function analyzeResume(
  resume: ResumeProfile,
  job: JobDescriptionProfile,
  signals: SourceDocumentSignals = emptySourceSignals(),
): AnalysisResult {
  const { matches, keywordCoverage } = matchResumeToJob(resume, job)
  const ats = analyzeAtsReadiness(resume, signals)
  const report = buildAnalysisReport({ matches, keywordCoverage, ats, job })

  return { report, ats, overallScore: report.overallScore }
}

/* ==========================================================================
   Optimization
   ========================================================================== */

export interface OptimizationResult {
  changeSet: ChangeSet
  /** The resume as it would look with every proposed change accepted. */
  proposedProfile: ResumeProfile
  /** ATS report and score recomputed against `proposedProfile`. */
  projectedAts: AtsReport
  projectedScore: number
  provider: AiProviderName
  model: string | null
  promptVersion: string
  /** Changes discarded by validation. Logged; surfaced only as a count. */
  rejected: RejectedChange[]
  usage: { inputTokens: number | null; outputTokens: number | null }
}

export interface OptimizeInput {
  resume: ResumeProfile
  job: JobDescriptionProfile
  analysis: AnalysisReport
  /** Sections the user asked to optimize. Defaults to all optimizable ones. */
  sections?: readonly string[]
}

const DEFAULT_SECTIONS = ['summary', 'skills', 'experience', 'projects'] as const

/**
 * Produces a validated set of proposed changes.
 *
 * Falls back to the rule-based engine when the model is unavailable or returns
 * something unusable — a degraded optimization is far better than a failed one,
 * and the response reports which engine actually ran so the UI can say so.
 */
export async function optimizeResume(input: OptimizeInput): Promise<OptimizationResult> {
  const sections = input.sections ?? DEFAULT_SECTIONS
  const matches = input.analysis.requirementMatches

  const provider = getAiProvider()

  let proposal
  let usedProvider: AiProviderName = 'deterministic'
  let model: string | null = null
  let promptVersion = 'rule-based-v1'
  let usage: OptimizationResult['usage'] = { inputTokens: null, outputTokens: null }

  if (provider) {
    try {
      const result = await proposeLlmOptimization(provider, {
        resume: input.resume,
        job: input.job,
        matches,
        sections,
      })
      proposal = result.proposal
      usage = result.usage
      promptVersion = result.promptVersion
      usedProvider = provider.name
      model = provider.model
    } catch (error) {
      logger.warn('optimization.llm_failed_falling_back', {
        provider: provider.name,
        code: AppError.isAppError(error) ? error.code : 'unknown',
      })
      proposal = undefined
    }
  }

  if (!proposal) {
    proposal = proposeRuleBasedOptimization({ resume: input.resume, job: input.job, matches })
    usedProvider = 'deterministic'
    model = null
    promptVersion = 'rule-based-v1'
    usage = { inputTokens: null, outputTokens: null }
  }

  const outcome = validateAndApplyProposal({
    original: input.resume,
    proposal,
    matches,
  })

  if (outcome.rejected.length > 0) {
    logger.warn('optimization.changes_rejected', {
      provider: usedProvider,
      rejectedCount: outcome.rejected.length,
      reasons: outcome.rejected.map((entry) => entry.reason),
    })
  }

  // Backstop: even after per-change validation, confirm no immutable fact moved.
  const immutable = verifyImmutableSections(input.resume, outcome.proposedProfile)
  if (!immutable.ok) {
    logger.error('optimization.immutable_section_violated', {
      provider: usedProvider,
      violations: immutable.violations,
    })
    throw new AppError(ERROR_CODES.AI_INVALID_OUTPUT, {
      context: { violations: immutable.violations },
    })
  }

  // The generated document is single-column, table-free and text-based by
  // construction, so the projected score uses our own generator's signals.
  const projectedAts = analyzeAtsReadiness(
    outcome.proposedProfile,
    generatedDocumentSignals(outcome.proposedProfile),
  )
  const projected = matchResumeToJob(outcome.proposedProfile, input.job)
  const projectedReport = buildAnalysisReport({
    matches: projected.matches,
    keywordCoverage: projected.keywordCoverage,
    ats: projectedAts,
    job: input.job,
  })

  return {
    changeSet: outcome.changeSet,
    proposedProfile: outcome.proposedProfile,
    projectedAts,
    projectedScore: projectedReport.overallScore,
    provider: usedProvider,
    model,
    promptVersion,
    rejected: outcome.rejected,
    usage,
  }
}

/** The prompt versions this build would use. Recorded on every run. */
export function activePromptVersions(): Record<string, string> {
  return {
    optimization: PROMPTS.resumeOptimization.PROMPT_VERSION,
    jdAnalysis: PROMPTS.jdAnalysis.PROMPT_VERSION,
    extraction: PROMPTS.resumeExtraction.PROMPT_VERSION,
  }
}
