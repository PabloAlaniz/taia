import { defineConfig, devices } from '@playwright/test'

// End-to-end tests drive the built app in a real browser against a real
// PostgreSQL. They run on their own port and never reuse a running server, so
// they can't end up pointed at a development instance and its data.
//
// E2E_DATABASE_URL is WIPED by e2e/global-setup.ts before the run. It defaults
// to the throwaway test database of `pnpm db:test:up`.
const PORT = 13433
// A second server with an access token, for e2e/auth.spec.ts. Same database,
// its own ports.
const AUTH_PORT = 13443
export const E2E_AUTH_URL = `http://127.0.0.1:${AUTH_PORT}`
export const E2E_API_TOKEN = 'e2e-access-token-0123456789'
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://taia_test:test@localhost:5433/taia_test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // One database and one onboarding per run: no parallelism.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'es-AR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Same processes as `pnpm start`: the WebSocket server and Next.js.
      command: `node scripts/ws-server.js & exec next start -p ${PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { DATABASE_URL: E2E_DATABASE_URL },
    },
    {
      command: `node scripts/ws-server.js & exec next start -p ${AUTH_PORT} -H 127.0.0.1`,
      url: `${E2E_AUTH_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        TAIA_API_TOKEN: E2E_API_TOKEN,
        WS_PORT: '13444',
        BROADCAST_PORT: '13445',
      },
    },
  ],
})
