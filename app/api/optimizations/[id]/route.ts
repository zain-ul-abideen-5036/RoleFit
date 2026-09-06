import { NextResponse } from 'next/server'

import { requireUuidParam, route } from '@/server/api/handler'
import { listChangeRecords, requireAnalysis, requireOptimizationRun } from '@/server/repositories'
import { buildDecidedProfile } from '@/server/services/optimization-service'
import { toChangeDto } from '@/server/api/dto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * An optimization run with its changes and the resume as currently decided.
 * The decided profile is recomputed on every read so the preview always
 * reflects the user's latest accept/reject choices.
 */
export const GET = route<{ id: string }>(
  async ({ params, user }) => {
    const runId = requireUuidParam(params.id, 'id')

    const run = await requireOptimizationRun(user.userId, runId)
    const [changes, analysis, decided] = await Promise.all([
      listChangeRecords(user.userId, runId),
      requireAnalysis(user.userId, run.analysisId),
      buildDecidedProfile(user.userId, runId),
    ])

    return NextResponse.json({
      run: {
        id: run.id,
        resumeId: run.resumeId,
        analysisId: run.analysisId,
        status: run.status,
        provider: run.provider,
        model: run.model,
        promptVersion: run.promptVersion,
        projectedScore: run.projectedScore,
        projectedAtsReport: run.projectedAtsReport,
        createdAt: run.createdAt,
      },
      baselineScore: analysis.overallScore,
      changeSet: run.changeSet,
      changes: changes.map(toChangeDto),
      decidedProfile: decided.profile,
    })
  },
  { rateLimit: 'api:read' },
)
