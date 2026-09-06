import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

/**
 * `server-only` is a marker package that throws when it is not resolved through
 * React's `react-server` export condition. Under Vitest there is no such
 * condition, so it is aliased to the package's own empty module — the import
 * still documents intent in source, and the Next.js build still enforces it.
 */
const serverOnlyStub = fileURLToPath(
  new URL('./node_modules/server-only/empty.js', import.meta.url),
)

/**
 * Environment shared by every suite. Set here rather than in a setup file
 * because `process.env.NODE_ENV` is typed readonly and assigning to it is a
 * compile error under strict TypeScript.
 */
const baseEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'error',
  AI_PROVIDER: 'deterministic',
  // Satisfies the env contract so code paths that read configuration can be
  // unit tested. Integration suites override DATABASE_URL with a real one.
  DATABASE_URL: 'postgresql://rolefit:rolefit@localhost:5432/rolefit_test',
  AUTH_SECRET: 'unit-test-secret-value-long-enough-to-satisfy-validation-0123456789',
  STORAGE_DRIVER: 'local',
} as const satisfies Partial<NodeJS.ProcessEnv>

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': rootDir.replace(/[/\\]$/, ''),
      'server-only': serverOnlyStub,
    },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          env: baseEnv,
        },
      },
      {
        extends: true,
        test: {
          // Component tests need a DOM; everything else runs faster without one.
          name: 'unit-dom',
          include: ['tests/unit/**/*.test.tsx'],
          environment: 'jsdom',
          env: baseEnv,
          setupFiles: ['tests/setup/dom.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          env: { ...baseEnv, STORAGE_DRIVER: 'local' },
          setupFiles: ['tests/setup/integration.ts'],
          // Database-backed suites share one schema, so they must not run in
          // parallel processes against the same tables.
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['lib/**/*.ts', 'server/**/*.ts'],
      exclude: ['**/*.d.ts', 'lib/**/types.ts', '**/__testing**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
})
