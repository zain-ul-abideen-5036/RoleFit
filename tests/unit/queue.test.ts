import { afterEach, describe, expect, it } from 'vitest'

import { resetEnvCache } from '@/lib/config/env'
import { queueDriver, queueIsEnabled } from '@/lib/queue'
import { CLAIM_TIMEOUT_MS, backoffMs } from '@/server/repositories/jobs'

/**
 * Queue configuration and the retry schedule.
 *
 * The claiming behaviour itself needs real rows and real locks, and is covered
 * by the integration suite. What is unit-testable is the schedule — which is
 * worth pinning, because a backoff that grows too slowly turns a failing
 * dependency into a self-inflicted denial of service.
 */

const ORIGINAL_ENV = { ...process.env }

function setEnv(values: Record<string, string | undefined>): void {
  const env = process.env as Record<string, string | undefined>
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  resetEnvCache()
}

afterEach(() => {
  const env = process.env as Record<string, string | undefined>
  for (const key of Object.keys(env)) {
    if (!(key in ORIGINAL_ENV)) delete env[key]
  }
  Object.assign(env, ORIGINAL_ENV)
  resetEnvCache()
})

describe('queue mode', () => {
  it('runs inline unless told otherwise', () => {
    setEnv({ QUEUE_DRIVER: undefined })

    // The default must be the mode that needs no extra process to work.
    expect(queueDriver()).toBe('inline')
    expect(queueIsEnabled()).toBe(false)
  })

  it('enables the worker path when configured', () => {
    setEnv({ QUEUE_DRIVER: 'database' })

    expect(queueDriver()).toBe('database')
    expect(queueIsEnabled()).toBe(true)
  })

  it('refuses a mode it does not implement', () => {
    setEnv({ QUEUE_DRIVER: 'sqs' })
    expect(() => queueDriver()).toThrowError(/QUEUE_DRIVER/)
  })
})

describe('backoffMs', () => {
  it('waits ten seconds after the first failure', () => {
    expect(backoffMs(1)).toBe(10_000)
  })

  it('doubles each time', () => {
    expect(backoffMs(2)).toBe(20_000)
    expect(backoffMs(3)).toBe(40_000)
    expect(backoffMs(4)).toBe(80_000)
  })

  it('caps at five minutes', () => {
    // Uncapped, attempt 20 would be nine days. A cap keeps a recovered
    // dependency from waiting out a backoff nobody remembers setting.
    expect(backoffMs(20)).toBe(5 * 60 * 1000)
    expect(backoffMs(100)).toBe(5 * 60 * 1000)
  })

  it('never returns zero, so a failing job cannot spin', () => {
    for (const attempts of [0, 1, 2, 5, 50]) {
      expect(backoffMs(attempts), `attempts=${attempts}`).toBeGreaterThan(0)
    }
  })

  it('treats a nonsensical attempt count as the first', () => {
    expect(backoffMs(0)).toBe(10_000)
    expect(backoffMs(-5)).toBe(10_000)
  })

  it('grows monotonically until the cap', () => {
    let previous = 0
    for (let attempts = 1; attempts <= 6; attempts += 1) {
      const delay = backoffMs(attempts)
      expect(delay, `attempts=${attempts}`).toBeGreaterThanOrEqual(previous)
      previous = delay
    }
  })
})

describe('the claim timeout', () => {
  it('is longer than the longest a run is allowed to take', () => {
    // A claim that expired while the work was still legitimately running would
    // let a second worker start the same run.
    const maxRunMs = 60_000 // vercel.json maxDuration for the optimize route
    expect(CLAIM_TIMEOUT_MS).toBeGreaterThan(maxRunMs)
  })

  it('is short enough that a crashed worker does not strand a run for long', () => {
    expect(CLAIM_TIMEOUT_MS).toBeLessThanOrEqual(10 * 60 * 1000)
  })
})
