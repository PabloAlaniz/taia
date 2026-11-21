import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // The React plugin transforms JSX (and provides the automatic runtime, so
  // component test files don't need to import React explicitly). Doing it via
  // a plugin instead of `esbuild.jsx` keeps JSX working under Vite 8/Rolldown,
  // whose SSR transform ignores the esbuild option.
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      '@taia/types': path.resolve(__dirname, '../../packages/types/src'),
      '@taia/runtime': path.resolve(__dirname, '../../packages/runtime/src'),
      '@taia/core': path.resolve(__dirname, '../../packages/core/src'),
      '@taia/domain': path.resolve(__dirname, '../../packages/domain/src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      // Count every source file, not only the ones a test happens to load.
      include: [
        'app/**/*.{ts,tsx}',
        'client/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'i18n/**/*.ts',
        'lib/**/*.{ts,tsx}',
        'instrumentation.ts',
      ],
      reporter: ['text-summary', 'html', 'json-summary'],
      // Floors at today's real coverage: raise them as tests are added,
      // never lower them to make a change pass.
      thresholds: {
        statements: 35,
        branches: 27,
        functions: 25,
        lines: 36,
      },
    },
  },
})
