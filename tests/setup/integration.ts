import { beforeAll } from 'vitest'

/**
 * Integration-suite setup.
 *
 * These suites talk to a real PostgreSQL instance. `npm run db:up` starts one
 * locally; CI provides one as a service container.
 */
beforeAll(() => {
  process.env.NODE_ENV = 'test'
  process.env.LOG_LEVEL = 'error'
  process.env.AI_PROVIDER = process.env.AI_PROVIDER ?? 'deterministic'
  process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER ?? 'local'
  process.env.AUTH_SECRET =
    process.env.AUTH_SECRET ?? 'test-secret-value-that-is-long-enough-for-validation-1234'

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for integration tests. Run `npm run db:up` and set it, or use the CI service container.',
    )
  }
})
