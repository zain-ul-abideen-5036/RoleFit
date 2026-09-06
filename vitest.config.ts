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
    // Node 20+ ships a global crypto; make sure suites see the same one the
    // application uses for ids and hashing.
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup/unit.ts'],
        },
      },
      {
        extends: true,
        test: {
          // Component tests need a DOM; everything else runs faster without one.
          name: 'unit-dom',
          include: ['tests/unit/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/setup/unit.ts', 'tests/setup/dom.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup/integration.ts'],
          // Database-backed suites share one schema; run them in sequence.
          fileParallelism: false,
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
