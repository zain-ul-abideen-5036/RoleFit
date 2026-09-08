import { NextResponse } from 'next/server'
import { z } from 'zod'

import { activeCapabilities } from '@/lib/ai'
import { queueIsEnabled } from '@/lib/queue'
import { parseJsonBody, route } from '@/server/api/handler'
import { listOptimizationRuns } from '@/server/repositories'
import { enqueueJob } from '@/server/repositories/jobs'
import { toChangeDto } from '@/server/api/dto'
import { createRunRecord, runOptimization } from '@/server/services/optimization-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const createRunSchema = z.object({
  analysisId: z.string().uuid('Run an analysis first.'),
})

/**
 * Starts an optimization run.
 *
 * Two dispatch modes behind one contract. Inline runs the work in the request
 * and returns 201 with the finished result; queued writes a job and returns 202
 * with the run id and a `queued` status. Both responses carry a run and its
 * status, so the client reads the status it is given rather than assuming which
 * mode it is talking to.
 */
export const POST = route(
  async ({ request, user }) => {
    const input = await parseJsonBody(request, createRunSchema)

    if (queueIsEnabled()) {
      const run = await createRunRecord({ userId: user.userId, analysisId: input.analysisId })
      await enqueueJob({ userId: user.userId, runId: run.id, kind: 'optimization' })

      // 202: accepted, not done. The client polls GET /api/optimizations/[id].
      return NextResponse.json(
        {
          run: {
            id: run.id,
            resumeId: run.resumeId,
            analysisId: run.analysisId,
            status: 'queued',
            projectedScore: null,
            provider: null,
          },
          changeSet: null,
          changes: [],
          capabilities: activeCapabilities(),
          rejectedCount: 0,
        },
        { status: 202 },
      )
    }

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
