import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { jobs } from '@/db/schema'
import { getDb } from '@/server/db/client'
import { signup } from '@/server/auth/service'
import { requireOptimizationRun } from '@/server/repositories'
import {
  CLAIM_TIMEOUT_MS,
  claimNextJob,
  deleteFinishedJobs,
  dueJobCount,
  enqueueJob,
  findJobByRun,
  jobQueueDepth,
  markJobFailed,
  markJobSucceeded,
} from '@/server/repositories/jobs'
import { createAnalysisForResume } from '@/server/services/analysis-service'
import { createRunRecord, executeRun } from '@/server/services/optimization-service'
import { ingestResume } from '@/server/services/resume-service'
import {
  assertMigrated,
  resetDatabase,
  teardownDatabase,
  TEST_PASSWORD,
  uniqueEmail,
} from '@/tests/helpers/db'
import { clearCookies } from '@/tests/setup/integration'
import { DEMO_JOB_DESCRIPTION_TEXT } from '@/tests/fixtures/demo-data'
import { generatePdf } from '@/lib/documents/pdf'
import { demoResumeProfile } from '@/tests/fixtures/demo-data'

/**
 * Job claiming, against a real database.
 *
 * The property that matters cannot be tested any other way: `FOR UPDATE SKIP
 * LOCKED` must let exactly one of several concurrent workers take a job. A mock
 * cannot exhibit that, and getting it wrong is invisible until two workers
 * process the same run in production.
 */

async function accountWithAnalysis(): Promise<{ userId: string; analysisId: string }> {
  const email = uniqueEmail('queue')
  const user = await signup({ email, password: TEST_PASSWORD })
  clearCookies()

  const pdf = await generatePdf(demoResumeProfile())
  const resume = await ingestResume({
    userId: user.userId,
    filename: 'resume.pdf',
    declaredMimeType: 'application/pdf',
    bytes: pdf,
  })

  const analysis = await createAnalysisForResume({
    userId: user.userId,
    resumeId: resume.resume.id,
    jobDescriptionText: DEMO_JOB_DESCRIPTION_TEXT,
  })

  return { userId: user.userId, analysisId: analysis.analysis.id }
}

beforeAll(async () => {
  await assertMigrated()
})

beforeEach(async () => {
  await resetDatabase()
  clearCookies()
})

afterAll(async () => {
  await teardownDatabase()
})

describe('enqueueing', () => {
  it('creates a pending job that is immediately due', async () => {
    const { userId, analysisId } = await accountWithAnalysis()
    const run = await createRunRecord({ userId, analysisId })

    const job = await enqueueJob({ userId, runId: run.id, kind: 'optimization' })

    expect(job.status).toBe('pending')
    expect(job.attempts).toBe(0)
    expect(await dueJobCount()).toBe(1)
  })

  it('refuses a second job for the same run', async () => {
    const { userId, analysisId } = await accountWithAnalysis()
    const run = await createRunRecord({ userId, analysisId })

    await enqueueJob({ userId, runId: run.id, kind: 'optimization' })

    // Enqueueing twice for one run is a bug, not a retry — retries are
    // attempts plus runAfter on the single row.
    await expect(enqueueJob({ userId, runId: run.id, kind: 'optimization' })).rejects.toBeDefined()
  })

  it('is only visible to the account that owns it', async () => {
    const first = await accountWithAnalysis()
    const second = await accountWithAnalysis()
    const run = await createRunRecord({ userId: first.userId, analysisId: first.analysisId })
    await enqueueJob({ userId: first.userId, runId: run.id, kind: 'optimization' })

    expect(await findJobByRun(first.userId, run.id)).not.toBeNull()
    expect(await findJobByRun(second.userId, run.id)).toBeNull()
  })
})

describe('claiming', () => {
  async function queued(): Promise<{ userId: string; runId: string; jobId: string }> {
    const { userId, analysisId } = await accountWithAnalysis()
    const run = await createRunRecord({ userId, analysisId })
    const job = await enqueueJob({ userId, runId: run.id, kind: 'optimization' })
    return { userId, runId: run.id, jobId: job.id }
  }

  it('takes a due job and records who took it', async () => {
    const { jobId } = await queued()

    const claimed = await claimNextJob('worker-a')

    expect(claimed?.id).toBe(jobId)
    expect(claimed?.status).toBe('claimed')
    expect(claimed?.claimedBy).toBe('worker-a')
    expect(claimed?.attempts).toBe(1)
  })

  it('returns null when there is nothing to do', async () => {
    expect(await claimNextJob('worker-a')).toBeNull()
  })

  it('does not hand the same job to two workers', async () => {
    await queued()

    const [first, second] = await Promise.all([claimNextJob('worker-a'), claimNextJob('worker-b')])

    // SKIP LOCKED is what makes this hold. Without it the two calls serialise
    // and both end up claiming the row.
    const claims = [first, second].filter(Boolean)
    expect(claims).toHaveLength(1)
  })

  it('spreads three jobs across three concurrent workers, each getting one', async () => {
    await Promise.all([queued(), queued(), queued()])

    const claimed = await Promise.all([
      claimNextJob('worker-a'),
      claimNextJob('worker-b'),
      claimNextJob('worker-c'),
    ])

    const ids = claimed.filter(Boolean).map((job) => job!.id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })

  it('does not take a job whose runAfter is in the future', async () => {
    const { jobId } = await queued()

    await getDb()
      .update(jobs)
      .set({ runAfter: new Date(Date.now() + 60_000) })
      .where(eq(jobs.id, jobId))

    expect(await claimNextJob('worker-a')).toBeNull()
    expect(await dueJobCount()).toBe(0)
  })

  it('reclaims a job whose worker went away', async () => {
    const { jobId } = await queued()
    await claimNextJob('worker-that-crashed')

    // Still claimed, so a fresh claim finds nothing.
    expect(await claimNextJob('worker-b')).toBeNull()

    // Past the timeout, it becomes available again — otherwise a crashed
    // worker strands a user's run permanently.
    const later = new Date(Date.now() + CLAIM_TIMEOUT_MS + 1000)
    const reclaimed = await claimNextJob('worker-b', later)

    expect(reclaimed?.id).toBe(jobId)
    expect(reclaimed?.claimedBy).toBe('worker-b')
    expect(reclaimed?.attempts).toBe(2)
  })
})

describe('finishing', () => {
  async function claimedJob() {
    const { userId, analysisId } = await accountWithAnalysis()
    const run = await createRunRecord({ userId, analysisId })
    await enqueueJob({ userId, runId: run.id, kind: 'optimization' })
    const job = await claimNextJob('worker-a')
    return { userId, run, job: job! }
  }

  it('marks a job succeeded and releases the claim', async () => {
    const { job } = await claimedJob()

    await markJobSucceeded(job.id)

    const row = await getDb().query.jobs.findFirst({ where: eq(jobs.id, job.id) })
    expect(row?.status).toBe('succeeded')
    expect(row?.claimedBy).toBeNull()
  })

  it('returns a failed job to pending with a delay', async () => {
    const { job } = await claimedJob()

    const outcome = await markJobFailed(job, 'AI_UNAVAILABLE')

    expect(outcome).toBe('retrying')
    const row = await getDb().query.jobs.findFirst({ where: eq(jobs.id, job.id) })
    expect(row?.status).toBe('pending')
    expect(row?.lastErrorCode).toBe('AI_UNAVAILABLE')
    expect(row!.runAfter.getTime()).toBeGreaterThan(Date.now())
  })

  it('declares a job dead once its attempts are used up', async () => {
    const { job } = await claimedJob()

    const outcome = await markJobFailed({ ...job, attempts: 3, maxAttempts: 3 }, 'INTERNAL')

    // Dead rather than pending, so a permanent failure is distinguishable from
    // a transient one on any dashboard that counts them.
    expect(outcome).toBe('dead')
    const row = await getDb().query.jobs.findFirst({ where: eq(jobs.id, job.id) })
    expect(row?.status).toBe('dead')
  })

  it('does not re-claim a dead job', async () => {
    const { job } = await claimedJob()
    await markJobFailed({ ...job, attempts: 3, maxAttempts: 3 }, 'INTERNAL')

    expect(await claimNextJob('worker-b')).toBeNull()
  })

  it('reports queue depth by status', async () => {
    const { job } = await claimedJob()
    await markJobFailed({ ...job, attempts: 3, maxAttempts: 3 }, 'INTERNAL')

    const depth = await jobQueueDepth()
    expect(depth.dead).toBe(1)
    expect(depth.claimed).toBe(0)
  })

  it('sweeps only finished jobs', async () => {
    const { job } = await claimedJob()
    await markJobSucceeded(job.id)

    // Backdate so it falls inside the cutoff.
    await getDb()
      .update(jobs)
      .set({ updatedAt: new Date(Date.now() - 86_400_000) })
      .where(eq(jobs.id, job.id))

    expect(await deleteFinishedJobs(new Date(Date.now() - 3600_000))).toBe(1)
  })
})

describe('a worker processes a run exactly as the request path does', () => {
  it('produces a succeeded run with changes', async () => {
    const { userId, analysisId } = await accountWithAnalysis()
    const created = await createRunRecord({ userId, analysisId })
    const job = await enqueueJob({ userId, runId: created.id, kind: 'optimization' })

    // What the worker loop does, without the loop.
    const claimed = await claimNextJob('worker-a')
    expect(claimed?.id).toBe(job.id)

    const run = await requireOptimizationRun(userId, claimed!.runId)
    const result = await executeRun(userId, run)
    await markJobSucceeded(claimed!.id)

    expect(result.changeSet.changes.length).toBeGreaterThan(0)

    const persisted = await requireOptimizationRun(userId, created.id)
    expect(persisted.status).toBe('succeeded')
    expect(persisted.projectedScore).not.toBeNull()
  })

  it('cannot process a run belonging to another account', async () => {
    const owner = await accountWithAnalysis()
    const other = await accountWithAnalysis()
    const run = await createRunRecord({ userId: owner.userId, analysisId: owner.analysisId })

    // The worker reads through the user-scoped repository, so a mismatched
    // owner is a 404 rather than a successful cross-account run.
    await expect(requireOptimizationRun(other.userId, run.id)).rejects.toBeDefined()
  })
})
