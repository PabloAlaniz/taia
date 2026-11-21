import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@taia/types': path.resolve(__dirname, '../types/src'),
      '@taia/runtime': path.resolve(__dirname, '../runtime/src'),
      '@taia/core': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    sequence: { concurrent: false },
    // Suites share one test database and reset its schema.
    fileParallelism: false,
    globalSetup: ['__tests__/integration/global-setup.ts'],
  },
})
