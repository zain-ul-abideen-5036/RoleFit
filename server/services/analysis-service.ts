import 'server-only'

import { createHash } from 'node:crypto'

import type { Analysis, JobDescription } from '@/db/schema'
import type { SourceDocumentSignals } from '@/lib/ats/types'
import { emptySourceSignals } from '@/lib/ats/types'
import { JOB_DESCRIPTION } from '@/lib/constants'
import type { AnalysisReport, RequirementMatch, ResumeProfile } from '@/lib/domain/types'
import { getEmbeddingProvider } from '@/lib/embeddings'
import { suggestGapBridges } from '@/lib/embeddings/gap-suggestions'
import { errors } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { cleanDocumentText } from '@/lib/matching/normalize'
import { analyzeResume } from '@/lib/optimization/pipeline'
import { parseJobDescription } from '@/lib/parsing/job-description-parser'
import {
  createAnalysis,
  createJobDescription,
  recordUsage,
  requireResume,
} from '@/server/repositories'

/**
 * Analysis.
 *
 * Entirely deterministic — no model is called. That is a product decision as
 * much as an engineering one: the score a user sees must be reproducible and
 * explainable, and it must not change because a provider shipped a new model.
 */

export interface CreateAnalysisInput {
  userId: string
  resumeId: string
  jobDescriptionText: string
  jobTitle?: string | undefined
  company?: string | undefined
}

export interface CreateAnalysisResult {
  analysis: Analysis
  jobDescription: JobDescription
}

/**
 * Nearest-span suggestions for the gaps, when embeddings are configured.
 *
 * Returns an empty array otherwise, which is the default. Failures are already
 * swallowed by `suggestGapBridges`; this exists so the caller has no branch and
 * the score is computed before this is ever reached.
 */
async function gapSuggestionsFor(
  resume: ResumeProfile,
  matches: readonly RequirementMatch[],
): Promise<AnalysisReport['gapSuggestions']> {
  const provider = getEmbeddingProvider()
  if (!provider) return []

  return suggestGapBridges({ resume, matches, provider })
}

export async function createAnalysisForResume(
  input: CreateAnalysisInput,
): Promise<CreateAnalysisResult> {
  const startedAt = Date.now()

  // Ownership is enforced by the repository; a resume belonging to another user
  // surfaces here as a 404.
  const resume = await requireResume(input.userId, input.resumeId)

  const rawText = cleanDocumentText(input.jobDescriptionText)

  if (rawText.length < JOB_DESCRIPTION.minLength) {
    throw errors.validation({
      jobDescriptionText: [
        `Please paste the full job description — at least ${JOB_DESCRIPTION.minLength} characters.`,
      ],
    })
  }
  if (rawText.length > JOB_DESCRIPTION.maxLength) {
    throw errors.validation({
      jobDescriptionText: [
        'That job description is too long. Please paste only the posting itself.',
      ],
    })
  }

  const profile = parseJobDescription(rawText, {
    titleHint: input.jobTitle ?? null,
    companyHint: input.company ?? null,
  })

  const jobDescription = await createJobDescription({
    userId: input.userId,
    title: (input.jobTitle?.trim() || profile.title || 'Untitled role').slice(0, 200),
    company: input.company?.trim() || profile.company,
    rawText,
    contentHash: createHash('sha256').update(rawText).digest('hex'),
    profile,
  })

  // The uploaded document's layout signals are not recoverable from the stored
  // profile, so formatting checks score against a neutral baseline on re-runs.
  // The first analysis after upload passes the real signals through.
  const signals: SourceDocumentSignals = emptySourceSignals()
  signals.extractedCharacters = resume.rawText.length

  const { report, ats, overallScore } = analyzeResume(resume.profile, profile, signals)

  // Advisory only, and computed after scoring so it cannot influence it. The
  // score above is already final at this point.
  report.gapSuggestions = await gapSuggestionsFor(resume.profile, report.requirementMatches)

  const analysis = await createAnalysis({
    userId: input.userId,
    resumeId: resume.id,
    jobDescriptionId: jobDescription.id,
    overallScore,
    report,
    atsReport: ats,
  })

  await recordUsage({
    userId: input.userId,
    kind: 'analysis',
    provider: 'deterministic',
    durationMs: Date.now() - startedAt,
  })

  logger.info('analysis.created', {
    userId: input.userId,
    analysisId: analysis.id,
    resumeId: resume.id,
    overallScore,
    requiredMissing: report.counts.requiredMissing,
    durationMs: Date.now() - startedAt,
  })

  return { analysis, jobDescription }
}
