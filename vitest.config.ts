import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        branches: 70,
        functions: 85,
        lines: 90,
        statements: 85,
      },
    },
    include: ['test/**/*.spec.ts'],
    testTimeout: 15_000,
  },
})
