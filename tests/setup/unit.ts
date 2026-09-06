import { beforeAll } from 'vitest'

/**
 * Unit-suite setup.
 *
 * Provides a deterministic, minimal environment. No database, no network and no
 * AI provider: anything a unit test needs must be injected explicitly.
 */
beforeAll(() => {
  process.env.NODE_ENV = 'test'
  process.env.AI_PROVIDER = 'deterministic'
  process.env.LOG_LEVEL = 'error'
})
