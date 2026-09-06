import { beforeAll } from 'vitest'

/**
 * Integration-suite setup.
 *
 * These suites talk to a real PostgreSQL instance. `npm run db:up` starts one
 * locally; CI provides one as a service container. Environment values that can
 * be set statically live in vitest.config.ts; only the checks that must fail
 * loudly at runtime are here.
 */
beforeAll(() => {
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = 'integration-test-secret-value-long-enough-to-validate-0123456789'
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for integration tests.\n' +
        'Run `npm run db:up`, then set DATABASE_URL=postgresql://rolefit:rolefit@localhost:5432/rolefit',
    )
  }
})
