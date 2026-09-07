import { beforeAll, vi } from 'vitest'

/**
 * Integration-suite setup.
 *
 * These suites talk to a real PostgreSQL instance. `npm run db:up` starts one
 * locally; CI provides one as a service container.
 *
 * `next/headers` is mocked with an in-process cookie jar. The auth service
 * legitimately reads and writes cookies, and without a request context those
 * calls throw. Mocking the jar rather than the auth service means the real
 * session logic — signing, epoch checks, expiry — is what gets tested.
 */

const cookieJar = new Map<string, { name: string; value: string }>()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => cookieJar.get(name),
    set: (name: string, value: string) => {
      if (value === '') cookieJar.delete(name)
      else cookieJar.set(name, { name, value })
    },
    delete: (name: string) => {
      cookieJar.delete(name)
    },
    getAll: () => Array.from(cookieJar.values()),
    has: (name: string) => cookieJar.has(name),
  }),
  headers: async () => new Headers(),
}))

/** Clears the simulated browser session between cases. */
export function clearCookies(): void {
  cookieJar.clear()
}

beforeAll(() => {
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = 'integration-test-secret-value-long-enough-to-validate-0123456789'
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for integration tests.\n' +
        'Run `npm run db:up`, then set DATABASE_URL=postgresql://rolefit:rolefit@localhost:5433/rolefit',
    )
  }
})
