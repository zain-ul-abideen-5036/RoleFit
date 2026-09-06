import { NextResponse } from 'next/server'
import { z } from 'zod'

import { activeCapabilities } from '@/lib/ai'
import { parseJsonBody, route } from '@/server/api/handler'
import { listOptimizationRuns } from '@/server/repositories'
import { runOptimization } from '@/server/services/optimization-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const createRunSchema = z.object({
  analysisId: z.string().uuid('Run an analysis first.'),
})

/**
 * Starts an optimization run.
 *
 * Runs synchronously within the function's duration budget. The run row is
 * created before the work starts and marked failed on error, so the same API
 * shape supports a queued worker later without a client change.
 */
export const POST = route(
  async ({ request, user }) => {
    const input = await parseJsonBody(request, createRunSchema)

    const result = await runOptimization({
      userId: user.userId,
      analysisId: input.analysisId,
    })

    return NextResponse.json(
      {
        run: {
          id: result.run.id,
          resumeId: result.run.resumeId,
          analysisId: result.run.analysisId,
          status: 'succeeded',
          projectedScore: result.projectedScore,
          provider: result.provider,
        },
        changeSet: result.changeSet,
        changes: result.changes.map(toChangeDto),
        // Told plainly so the UI can explain what kind of optimization ran.
        capabilities: activeCapabilities(),
        rejectedCount: result.rejectedCount,
      },
      { status: 201 },
    )
  },
  { rateLimit: 'optimization:create' },
)

/** Lists the caller's optimization runs. */
export const GET = route(
  async ({ user }) => {
    const runs = await listOptimizationRuns(user.userId)
    return NextResponse.json({
      runs: runs.map((run) => ({
        id: run.id,
        resumeId: run.resumeId,
        analysisId: run.analysisId,
        status: run.status,
        provider: run.provider,
        projectedScore: run.projectedScore,
        createdAt: run.createdAt,
        changeCount: run.changeSet?.changes.length ?? 0,
      })),
    })
  },
  { rateLimit: 'api:read' },
)

export function toChangeDto(change: {
  id: string
  targetPath: string
  section: string
  action: string
  beforeText: string | null
  afterText: string | null
  rationale: string
  evidence: string[]
  decision: string
  editedText: string | null
}) {
  return {
    id: change.id,
    targetPath: change.targetPath,
    section: change.section,
    action: change.action,
    before: change.beforeText,
    after: change.afterText,
    rationale: change.rationale,
    evidence: change.evidence,
    decision: change.decision,
    editedText: change.editedText,
  }
}
