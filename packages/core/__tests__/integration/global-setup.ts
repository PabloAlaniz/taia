// Global setup — runs once before all integration tests
// Checks gateway connectivity and prints a clear message (test workers'
// console output is not shown, so pairing instructions are printed here).

import { OpenClawPairingRequiredError } from '@taia/runtime/adapters/openclaw'
import { createTestClient, getIdentityFile } from './setup'

async function checkHandshake(): Promise<void> {
  const client = createTestClient({ rpcTimeoutMs: 5_000 })
  try {
    await client.connect()
    console.log(
      `[integration] \u2705 Handshake OK (protocol v${client.getConnectionInfo().protocol})`,
    )
  } catch (err) {
    if (err instanceof OpenClawPairingRequiredError) {
      console.warn(
        `[integration] \u26A0 Gateway requires pairing — tests will be skipped. Approve and re-run:\n` +
          `    openclaw devices approve ${err.requestId}\n` +
          `  (test identity: ${getIdentityFile()})`,
      )
    } else {
      console.warn(`[integration] \u26A0 Handshake failed: ${(err as Error).message}`)
    }
  } finally {
    client.disconnect()
  }
}

export async function setup() {
  const url = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789'
  const httpUrl = url.replace(/^ws/, 'http')

  console.log(`\n[integration] Checking gateway at ${httpUrl}...`)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    const res = await fetch(`${httpUrl}/health`, {
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)

    if (res.ok) {
      console.log(`[integration] \u2705 Gateway available`)
      await checkHandshake()
    } else {
      console.warn(
        `[integration] \u26A0 Gateway returned ${res.status} — tests that require it will be skipped`,
      )
    }
  } catch {
    console.warn(
      `[integration] \u26A0 Gateway not available at ${httpUrl} — integration tests will be skipped`,
    )
  }

  const canMutate = process.env.INTEGRATION_TEST_MUTATE === '1'
  if (canMutate) {
    console.log(`[integration] \uD83D\uDD27 INTEGRATION_TEST_MUTATE=1 — mutation tests enabled`)
  } else {
    console.log(
      `[integration] \uD83D\uDD12 Mutation tests disabled (set INTEGRATION_TEST_MUTATE=1 to enable)`,
    )
  }

  console.log('')
}
