/**
 * Background worker.
 *
 * Claims optimization jobs and runs them. Started with `npm run worker`, and
 * intended to run as one or more long-lived processes alongside the app — a
 * container, a systemd unit, a Railway service. It is not a Vercel function:
 * claiming is a loop, and serverless has nowhere to loop.
 *
 * Safe to run more than one. Claiming uses `FOR UPDATE SKIP LOCKED`, so two
 * workers never take the same job and never block each other.
 *
 * Shutdown is graceful: SIGINT and SIGTERM stop the loop from taking new work
 * and let the job in flight finish, because killing a worker mid-run would
 * leave the claim to time out five minutes later for no reason.
 */
import { hostname } from 'node:os'

import { getEnv } from '@/lib/config/env'
import { AppError, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { closeDb } from '@/server/db/client'
import {
  claimNextJob,
  jobQueueDepth,
  markJobFailed,
  markJobSucceeded,
} from '@/server/repositories/jobs'
import { executeRun } from '@/server/services/optimization-service'
import { requireOptimizationRun } from '@/server/repositories'

const WORKER_ID = `${hostname()}-${process.pid}`.slice(0, 120)

let running = true

function stop(signal: string): void {
  if (!running) return
  running = false
  logger.info('worker.shutdown_requested', { signal, workerId: WORKER_ID })
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

async function sleep(seconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

/** Processes one job. Returns false when there was nothing to do. */
async function processNext(): Promise<boolean> {
  const job = await claimNextJob(WORKER_ID)
  if (!job) return false

  const startedAt = Date.now()

  try {
    // Loaded through the user-scoped repository, exactly as the request path
    // does. A worker is not a reason to read someone's row without their id.
    const run = await requireOptimizationRun(job.userId, job.runId)
    await executeRun(job.userId, run)
    await markJobSucceeded(job.id)

    logger.info('worker.job_succeeded', {
      jobId: job.id,
      runId: job.runId,
      attempts: job.attempts,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    const appError = toAppError(error)
    const outcome = await markJobFailed(job, appError.code)

    // The code, never the message: an optimization failure can quote resume
    // content, and this line goes to a log aggregator.
    logger.error('worker.job_failed', {
      jobId: job.id,
      runId: job.runId,
      code: appError.code,
      attempts: job.attempts,
      outcome,
      durationMs: Date.now() - startedAt,
    })
  }

  return true
}

async function main(): Promise<void> {
  const env = getEnv()

  if (env.QUEUE_DRIVER !== 'database') {
    // Refused rather than idling. A worker running against an inline
    // deployment would consume nothing and look healthy while doing so, which
    // is a worse failure than not starting.
    throw new Error(
      `QUEUE_DRIVER is "${env.QUEUE_DRIVER}". The worker only has work to do when it is "database".`,
    )
  }

  const depth = await jobQueueDepth()
  logger.info('worker.started', { workerId: WORKER_ID, ...depth })

  while (running) {
    let did = false
    try {
      did = await processNext()
    } catch (error) {
      // A failure in claiming itself — the database is unreachable, most
      // likely. Back off rather than spinning on it.
      logger.error('worker.claim_failed', {
        workerId: WORKER_ID,
        code: AppError.isAppError(error) ? error.code : 'unknown',
      })
      await sleep(env.QUEUE_POLL_SECONDS)
      continue
    }

    // Only wait when the queue was empty; otherwise drain it as fast as it
    // fills, which is what a backlog needs.
    if (!did && running) await sleep(env.QUEUE_POLL_SECONDS)
  }

  logger.info('worker.stopped', { workerId: WORKER_ID })
}

main()
  .then(async () => {
    await closeDb()
    process.exit(0)
  })
  .catch(async (error: unknown) => {
    process.stderr.write(`Worker failed: ${String(error)}\n`)
    await closeDb().catch(() => undefined)
    process.exit(1)
  })
