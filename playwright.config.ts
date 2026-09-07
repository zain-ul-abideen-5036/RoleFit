import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end configuration.
 *
 * The suite runs against a production build, not the dev server: dev-mode
 * behaviour (double-invoked effects, unminified bundles, no route caching)
 * differs enough that passing there is not evidence the deployed app works.
 *
 * A dedicated database is used so E2E runs never disturb local development
 * data, and so the suite can truncate freely.
 */

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://rolefit:rolefit@localhost:5433/rolefit_e2e'

const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './tests/e2e/setup/global-setup.ts',

  // A shared database means shared state; serial execution keeps assertions
  // about "the account has one resume" meaningful.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // Downloads are asserted on, so they must be accepted.
    acceptDownloads: true,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    // Always start a fresh server. Reusing whatever happens to be on the port
    // means testing a stale build, which produces failures and — worse —
    // passes that describe code no longer in the tree.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      DATABASE_URL,
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: BASE_URL,
      AUTH_SECRET: 'e2e-test-secret-value-that-is-definitely-long-enough-0123456789',
      AI_PROVIDER: 'deterministic',
      STORAGE_DRIVER: 'local',
      RATE_LIMIT_DRIVER: 'memory',
      // The suite creates many accounts from one address. The limiter still
      // runs — and is asserted on — but with headroom for a full pass.
      RATE_LIMIT_MULTIPLIER: '25',
      ANALYTICS_PROVIDER: 'none',
      LOG_LEVEL: 'error',
    },
  },
})
