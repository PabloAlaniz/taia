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
    coverage: {
      // Count every source file, not only the ones a test happens to load.
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      // Floors at today's real coverage: raise them as tests are added,
      // never lower them to make a change pass.
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 71,
      },
    },
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    exclude: ['__tests__/integration/**'],
  },
})
