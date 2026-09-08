import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EnvConfigError } from '@/lib/config/env'

/**
 * The health endpoint's job on a first deploy.
 *
 * It answered `config: invalid, database: unreachable` on a real deployment
 * and stopped there, which named nothing actionable: the operator saw a
 * generic 500 from the sign-up form and had no way to learn that
 * `DATABASE_URL` had never been set. So what is asserted here is that it names
 * the failure — and, just as firmly, that it names only the variable and never
 * its value.
 */

const { getEnv, getSql } = vi.hoisted(() => ({
  getEnv: vi.fn(),
  getSql: vi.fn(),
}))

vi.mock('@/lib/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config/env')>()
  return { ...actual, getEnv }
})

vi.mock('@/server/db/client', () => ({ getSql }))

const OK_ENV = {
  AI_PROVIDER: 'deterministic',
  STORAGE_DRIVER: 's3',
  RATE_LIMIT_DRIVER: 'upstash',
}

/**
 * A stand-in for the postgres.js tag, answering each query in turn.
 *
 * `unreachable` is a rejection on the first call, which is what a bad host or
 * a refused connection actually produces.
 */
function stubSql(...responses: (unknown[] | Error)[]): void {
  let call = 0
  getSql.mockReturnValue(() => {
    const response = responses[call++]
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response ?? [])
  })
}

async function get(): Promise<{ status: number; body: Record<string, unknown> }> {
  const { GET } = await import('@/app/api/health/route')
  const response = await GET()
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

beforeEach(() => {
  vi.resetModules()
  getEnv.mockReturnValue(OK_ENV)
  stubSql([{ hasLedger: true }], [{ n: 3 }])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('a healthy deployment', () => {
  it('answers ok with 200', async () => {
    const { status, body } = await get()

    expect(status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.checks).toMatchObject({ config: 'ok', database: 'ok' })
  })

  it('omits invalidConfig entirely rather than sending it empty', async () => {
    const { body } = await get()
    expect(body).not.toHaveProperty('invalidConfig')
  })

  it('reports which providers are configured', async () => {
    const { body } = await get()

    expect(body.checks).toMatchObject({
      aiProvider: 'deterministic',
      storageDriver: 's3',
      rateLimitDriver: 'upstash',
    })
  })
})

describe('when configuration is invalid', () => {
  it('names the variables that failed', async () => {
    // The exact shape of a first deploy with no environment variables set.
    getEnv.mockImplementation(() => {
      throw new EnvConfigError('Invalid environment configuration:\n  - ...', [
        'AUTH_SECRET',
        'DATABASE_URL',
      ])
    })

    const { status, body } = await get()

    expect(status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.checks).toMatchObject({ config: 'invalid' })
    expect(body.invalidConfig).toEqual(['AUTH_SECRET', 'DATABASE_URL'])
  })

  it('never leaks the value, only the name', async () => {
    // A credential pasted into the wrong field is the case that matters: a zod
    // enum failure echoes what it received, so the message must not travel.
    const secret = 'postgresql://user:hunter2@db.example.com/main'
    getEnv.mockImplementation(() => {
      throw new EnvConfigError(
        `Invalid environment configuration:\n  - AI_PROVIDER: received '${secret}'`,
        ['AI_PROVIDER'],
      )
    })

    const { body } = await get()

    expect(JSON.stringify(body)).not.toContain('hunter2')
    expect(JSON.stringify(body)).not.toContain(secret)
    expect(body.invalidConfig).toEqual(['AI_PROVIDER'])
  })

  it('degrades without invalidConfig when the failure is not an EnvConfigError', async () => {
    getEnv.mockImplementation(() => {
      throw new Error('something else entirely')
    })

    const { status, body } = await get()

    expect(status).toBe(503)
    expect(body.checks).toMatchObject({ config: 'invalid' })
    expect(body).not.toHaveProperty('invalidConfig')
  })
})

describe('the database check', () => {
  it('reports unreachable when the connection fails', async () => {
    stubSql(new Error('ECONNREFUSED'))

    const { status, body } = await get()

    expect(status).toBe(503)
    expect(body.checks).toMatchObject({ database: 'unreachable' })
  })

  it('distinguishes a reachable but unmigrated database', async () => {
    // The trap this exists for: DATABASE_URL correct, migrations never run.
    // Reported as `ok` by a bare `select 1`, while every sign-up 500s.
    stubSql([{ hasLedger: false }])

    const { status, body } = await get()

    expect(status).toBe(503)
    expect(body.checks).toMatchObject({ database: 'not-migrated' })
  })

  it('treats an empty ledger as unmigrated', async () => {
    stubSql([{ hasLedger: true }], [{ n: 0 }])

    const { body } = await get()
    expect(body.checks).toMatchObject({ database: 'not-migrated' })
  })

  it('does not raise on a missing relation, so the two stay distinguishable', async () => {
    // to_regclass returns null rather than raising, which is why the check does
    // not have to match on error text to tell these apart.
    stubSql([{ hasLedger: false }])

    const { body } = await get()
    expect(body.checks).not.toMatchObject({ database: 'unreachable' })
  })

  it('survives getSql itself throwing', async () => {
    // The regression this endpoint shipped with. `getSql()` builds its pool
    // from `getEnv()`, so it throws whenever configuration is invalid — and
    // constructing it outside the try turned every misconfigured deployment
    // into an uncaught 500 with no body, which is strictly less information
    // than the "invalid" it replaced. The earlier stub always returned a
    // working tag, so it could not see this.
    getSql.mockImplementation(() => {
      throw new Error('Invalid environment configuration')
    })

    const { status, body } = await get()

    expect(status).toBe(503)
    expect(body.checks).toMatchObject({ database: 'unreachable' })
  })

  it('still reports the config diagnosis when getSql throws', async () => {
    // Both failures have the same root cause, so this is the exact shape a
    // deployment with missing variables produces. The names must survive it.
    getEnv.mockImplementation(() => {
      throw new EnvConfigError('...', ['AUTH_SECRET', 'DATABASE_URL'])
    })
    getSql.mockImplementation(() => {
      throw new Error('Invalid environment configuration')
    })

    const { status, body } = await get()

    expect(status).toBe(503)
    expect(body.invalidConfig).toEqual(['AUTH_SECRET', 'DATABASE_URL'])
  })

  it('never rejects, whatever fails', async () => {
    // A health endpoint that throws is a health endpoint that cannot report.
    getEnv.mockImplementation(() => {
      throw new Error('boom')
    })
    getSql.mockImplementation(() => {
      throw new Error('boom')
    })

    const { GET } = await import('@/app/api/health/route')
    await expect(GET()).resolves.toBeDefined()
  })

  it('runs even when configuration is invalid', async () => {
    // Both answers at once are what turn one request into a full diagnosis.
    getEnv.mockImplementation(() => {
      throw new EnvConfigError('...', ['DATABASE_URL'])
    })
    stubSql(new Error('ECONNREFUSED'))

    const { body } = await get()

    expect(body.checks).toMatchObject({ config: 'invalid', database: 'unreachable' })
    expect(body.invalidConfig).toEqual(['DATABASE_URL'])
  })
})
