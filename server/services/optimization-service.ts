import 'server-only'

import type { ChangeRecord, OptimizationRun } from '@/db/schema'
import { AppError, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { applyDecisions } from '@/lib/optimization/apply'
import { optimizeResume } from '@/lib/optimization/pipeline'
import type { ChangeSet, ReviewableChange } from '@/lib/optimization/types'
import type { ResumeProfile } from '@/lib/domain/types'
import {
  completeOptimizationRun,
  createOptimizationRun,
  failOptimizationRun,
  insertChangeRecords,
  listChangeRecords,
  recordUsage,
  requireAnalysis,
  requireJobDescription,
  requireOptimizationRun,
  requireResume,
  updateChangeDecision,
} from '@/server/repositories'

/**
 * Optimization runs.
 *
 * A run is persisted before the work starts and marked failed if it throws, so
 * an interrupted run is visible in history rather than silently absent. That
 * also means the processing step can later move to a queue worker without the
 * API contract changing — the row already exists in `queued`/`running` state.
 */

export interface RunOptimizationInput {
  userId: string
  analysisId: string
}

export interface RunOptimizationResult {
  run: OptimizationRun
  changes: ChangeRecord[]
  changeSet: ChangeSet
  projectedScore: number
  /** Which engine produced the proposal, so the UI can be honest about it. */
  provider: string
  rejectedCount: number
}

/**
 * Creates the run row without doing any work.
 *
 * Split out so the inline and queued paths share one definition of what a run
 * is. The row exists — and is visible in history — before any work starts,
 * whichever path runs it.
 */
export async function createRunRecord(input: RunOptimizationInput): Promise<OptimizationRun> {
  const analysis = await requireAnalysis(input.userId, input.analysisId)
  const resume = await requireResume(input.userId, analysis.resumeId)

  return createOptimizationRun({
    userId: input.userId,
    analysisId: analysis.id,
    resumeId: resume.id,
    // Overwritten on completion with whichever engine actually ran.
    provider: 'pending',
    model: null,
    promptVersion: 'pending',
  })
}

/**
 * Does the work for a run that already exists.
 *
 * Called directly by the inline path and by the worker. Takes `userId` as well
 * as `runId` so every read stays scoped to the owner — a worker processing a
 * queue is not a reason to widen access.
 */
export async function executeRun(
  userId: string,
  run: OptimizationRun,
): Promise<RunOptimizationResult> {
  const startedAt = Date.now()
  const analysis = await requireAnalysis(userId, run.analysisId)
  const resume = await requireResume(userId, analysis.resumeId)
  const jobDescription = await requireJobDescription(userId, analysis.jobDescriptionId)

  try {
    const result = await optimizeResume({
      resume: resume.profile,
      job: jobDescription.profile,
      analysis: analysis.report,
    })

    await completeOptimizationRun(userId, run.id, {
      proposedProfile: result.proposedProfile,
      changeSet: result.changeSet,
      projectedAtsReport: result.projectedAts,
      projectedScore: result.projectedScore,
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
    })

    const changes = await insertChangeRecords(
      result.changeSet.changes.map((change) => ({
        optimizationRunId: run.id,
        userId: userId,
        targetPath: change.targetPath,
        section: change.section,
        action: change.action,
        beforeText: change.before,
        afterText: change.after,
        rationale: change.rationale,
        evidence: change.evidence.map((entry) => entry.excerpt),
        // Low-impact changes start accepted so a user is not made to click
        // through a dozen single-word tweaks; anything substantive waits for an
        // explicit decision.
        decision: change.impact === 'low' ? 'accepted' : 'pending',
      })),
    )

    await recordUsage({
      userId: userId,
      kind: 'optimization',
      provider: result.provider,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      durationMs: Date.now() - startedAt,
    })

    logger.info('optimization.completed', {
      userId: userId,
      runId: run.id,
      provider: result.provider,
      changeCount: result.changeSet.changes.length,
      rejectedCount: result.rejected.length,
      projectedScore: result.projectedScore,
      durationMs: Date.now() - startedAt,
    })

    return {
      run: { ...run, status: 'succeeded', projectedScore: result.projectedScore },
      changes,
      changeSet: result.changeSet,
      projectedScore: result.projectedScore,
      provider: result.provider,
      rejectedCount: result.rejected.length,
    }
  } catch (error) {
    const appError = toAppError(error)
    await failOptimizationRun(userId, run.id, appError.code)
    logger.error('optimization.failed', {
      userId: userId,
      runId: run.id,
      code: appError.code,
      error,
    })
    throw appError
  }
}

/**
 * Creates a run and processes it in the same request.
 *
 * The default path. A deterministic run finishes in well under a second and an
 * LLM run inside `AI_TIMEOUT_MS`, so waiting is cheaper than the round trips
 * polling would cost.
 */
export async function runOptimization(input: RunOptimizationInput): Promise<RunOptimizationResult> {
  const run = await createRunRecord(input)
  return executeRun(input.userId, run)
}

/* ==========================================================================
   Change review
   ========================================================================== */

export async function decideChange(
  userId: string,
  changeId: string,
  decision: ChangeRecord['decision'],
  editedText: string | null,
): Promise<ChangeRecord> {
  if (decision === 'edited' && !editedText?.trim()) {
    throw new AppError('VALIDATION_FAILED', {
      fieldErrors: { editedText: ['Enter the text you would like to use.'] },
    })
  }

  return updateChangeDecision(
    userId,
    changeId,
    decision,
    decision === 'edited' ? (editedText?.trim() ?? null) : null,
  )
}

/**
 * Rebuilds the resume from the original plus the user's decisions.
 *
 * Always derived, never stored incrementally: the final document is a pure
 * function of (original resume, decisions), so a change of mind is always
 * reversible and there is no drifting mutable copy.
 */
export async function buildDecidedProfile(
  userId: string,
  runId: string,
): Promise<{ run: OptimizationRun; profile: ResumeProfile; changes: ReviewableChange[] }> {
  const run = await requireOptimizationRun(userId, runId)
  const resume = await requireResume(userId, run.resumeId)
  const records = await listChangeRecords(userId, runId)

  const changeSet = run.changeSet
  const byPath = new Map((changeSet?.changes ?? []).map((change) => [change.targetPath, change]))

  const reviewable: ReviewableChange[] = records.map((record) => {
    const original = byPath.get(record.targetPath)
    return {
      id: record.id,
      targetPath: record.targetPath,
      section: record.section as ReviewableChange['section'],
      action: record.action,
      before: record.beforeText,
      after: record.afterText,
      rationale: record.rationale,
      evidence: (original?.evidence ?? []) as ReviewableChange['evidence'],
      addressesRequirements: original?.addressesRequirements ?? [],
      impact: original?.impact ?? 'medium',
      orderedItems: original?.orderedItems ?? null,
      decision: record.decision,
      editedText: record.editedText,
    }
  })

  return { run, profile: applyDecisions(resume.profile, reviewable), changes: reviewable }
}
