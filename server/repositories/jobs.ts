import 'server-only'

import { and, asc, eq, lt, lte, or, sql } from 'drizzle-orm'

import { jobs, type Job } from '@/db/schema'
import { getDb } from '@/server/db/client'

/**
 * Job queue access.
 *
 * Claiming uses `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction, which
 * is what makes this safe with more than one worker: a row being considered by
 * another transaction is skipped rather than waited on, so workers never block
 * each other and never both take the same job.
 */

/** How long a claim may be held before another worker may take it back. */
export const CLAIM_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Delay before the next attempt, in milliseconds.
 *
 * Exponential from 10s, capped at 5 minutes. Exported so the schedule is
 * testable rather than buried in a query.
 */
export function backoffMs(attempts: number): number {
  const base = 10_000 * 2 ** Math.max(0, attempts - 1)
  return Math.min(base, 5 * 60 * 1000)
}

export async function enqueueJob(input: {
  userId: string
  runId: string
  kind: 'optimization'
  maxAttempts?: number
}): Promise<Job> {
  const [job] = await getDb()
    .insert(jobs)
    .values({
      userId: input.userId,
      runId: input.runId,
      kind: input.kind,
      ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
    })
    .returning()

  if (!job) throw new Error('job insert returned no row')
  return job
}

/**
 * Takes one due job, or returns null.
 *
 * Due means pending with `runAfter` in the past, or claimed so long ago that
 * the worker holding it must be gone. Reclaiming on a timeout is what stops a
 * crashed worker stranding a user's run forever.
 */
export async function claimNextJob(workerId: string, now: Date = new Date()): Promise<Job | null> {
  const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS)

  return getDb().transaction(async (tx) => {
    const candidates = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        // Drizzle operators rather than a raw sql template: postgres.js cannot
        // bind a JS Date as an untyped parameter and throws at bind time.
        or(
          and(eq(jobs.status, 'pending'), lte(jobs.runAfter, now)),
          and(eq(jobs.status, 'claimed'), lt(jobs.claimedAt, staleBefore)),
        ),
      )
      .orderBy(asc(jobs.runAfter))
      .limit(1)
      // Skips a row another transaction is already looking at, instead of
      // waiting for it. Without this two workers serialise on the same job.
      .for('update', { skipLocked: true })

    const candidate = candidates[0]
    if (!candidate) return null

    const [claimed] = await tx
      .update(jobs)
      .set({
        status: 'claimed',
        claimedAt: now,
        claimedBy: workerId,
        attempts: sql`${jobs.attempts} + 1`,
        updatedAt: now,
      })
      .where(eq(jobs.id, candidate.id))
      .returning()

    return claimed ?? null
  })
}

export async function markJobSucceeded(jobId: string): Promise<void> {
  await getDb()
    .update(jobs)
    .set({ status: 'succeeded', claimedAt: null, claimedBy: null, updatedAt: new Date() })
    .where(eq(jobs.id, jobId))
}

/**
 * Records a failure and decides whether to retry.
 *
 * A job that has used its attempts becomes `dead` rather than `failed`, so the
 * two are distinguishable: `failed` is transient and will be retried, `dead`
 * needs a person.
 */
export async function markJobFailed(
  job: Pick<Job, 'id' | 'attempts' | 'maxAttempts'>,
  errorCode: string,
  now: Date = new Date(),
): Promise<'retrying' | 'dead'> {
  const exhausted = job.attempts >= job.maxAttempts

  await getDb()
    .update(jobs)
    .set({
      status: exhausted ? 'dead' : 'pending',
      claimedAt: null,
      claimedBy: null,
      lastErrorCode: errorCode.slice(0, 80),
      runAfter: exhausted ? now : new Date(now.getTime() + backoffMs(job.attempts)),
      updatedAt: now,
    })
    .where(eq(jobs.id, job.id))

  return exhausted ? 'dead' : 'retrying'
}

export async function findJobByRun(userId: string, runId: string): Promise<Job | null> {
  const found = await getDb().query.jobs.findFirst({
    // Scoped by user like every other repository read, so one account cannot
    // learn anything about another's queued work.
    where: and(eq(jobs.userId, userId), eq(jobs.runId, runId)),
  })
  return found ?? null
}

/** Counts by status. For the worker's log line and for diagnostics. */
export async function jobQueueDepth(): Promise<{
  pending: number
  claimed: number
  dead: number
}> {
  const rows = await getDb()
    .select({ status: jobs.status, count: sql<number>`count(*)::int` })
    .from(jobs)
    .groupBy(jobs.status)

  const byStatus = new Map(rows.map((row) => [row.status, row.count]))

  return {
    pending: byStatus.get('pending') ?? 0,
    claimed: byStatus.get('claimed') ?? 0,
    dead: byStatus.get('dead') ?? 0,
  }
}

/** Removes finished jobs older than the cutoff. Housekeeping, not a control. */
export async function deleteFinishedJobs(before: Date): Promise<number> {
  const deleted = await getDb()
    .delete(jobs)
    .where(and(eq(jobs.status, 'succeeded'), lt(jobs.updatedAt, before)))
    .returning({ id: jobs.id })

  return deleted.length
}

/** Jobs that are due right now. Exported for tests and diagnostics. */
export async function dueJobCount(now: Date = new Date()): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.status, 'pending'), lte(jobs.runAfter, now)))

  return rows[0]?.count ?? 0
}
