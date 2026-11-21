// Integration test helpers — shared setup for all integration tests

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  OpenClawAdapter,
  registerOpenClawFactory,
  type OpenClawCredentialStore,
} from '@taia/runtime/adapters/openclaw'
import { OpenClawClient } from '@taia/runtime/adapters/openclaw/client'

// --- Environment ---

export function getGatewayUrl(): string {
  return process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789'
}

export function getGatewayToken(): string {
  return process.env.OPENCLAW_GATEWAY_TOKEN || ''
}

export function canMutate(): boolean {
  return process.env.INTEGRATION_TEST_MUTATE === '1'
}

// --- Device credentials ---
// The gateway pairs devices: approve the test identity once
// (`openclaw devices approve <requestId>`) and it is reused across runs.

export function getIdentityFile(): string {
  return (
    process.env.OPENCLAW_TEST_IDENTITY_FILE ||
    path.join(os.tmpdir(), 'taia-openclaw-integration-identity.json')
  )
}

type CredentialFile = {
  identity?: Awaited<ReturnType<OpenClawCredentialStore['loadIdentity']>>
  tokens?: Record<string, { token: string; scopes: string[] }>
}

function readCredentials(): CredentialFile {
  try {
    return JSON.parse(fs.readFileSync(getIdentityFile(), 'utf8')) as CredentialFile
  } catch {
    return {}
  }
}

function writeCredentials(data: CredentialFile): void {
  fs.writeFileSync(getIdentityFile(), JSON.stringify(data), { mode: 0o600 })
}

/** File-backed credential store so a paired test identity survives runs. */
export const fileCredentialStore: OpenClawCredentialStore = {
  loadIdentity: async () => readCredentials().identity ?? null,
  saveIdentity: async (identity) => writeCredentials({ ...readCredentials(), identity }),
  loadDeviceToken: async (role) => readCredentials().tokens?.[role] ?? null,
  saveDeviceToken: async (role, token) => {
    const data = readCredentials()
    writeCredentials({ ...data, tokens: { ...data.tokens, [role]: token } })
  },
  clearDeviceToken: async (role) => {
    const data = readCredentials()
    const tokens = { ...data.tokens }
    delete tokens[role]
    writeCredentials({ ...data, tokens })
  },
}

// --- Client factory ---

export function createTestClient(overrides?: {
  url?: string
  token?: string
  reconnect?: boolean
  rpcTimeoutMs?: number
  /** `null` uses an ephemeral, unpaired identity. */
  credentialStore?: OpenClawCredentialStore | null
}): OpenClawClient {
  return new OpenClawClient({
    url: overrides?.url ?? getGatewayUrl(),
    token: overrides?.token ?? getGatewayToken(),
    reconnect: overrides?.reconnect ?? false,
    rpcTimeoutMs: overrides?.rpcTimeoutMs ?? 10_000,
    credentialStore:
      overrides?.credentialStore === null
        ? undefined
        : (overrides?.credentialStore ?? fileCredentialStore),
  })
}

/**
 * Configure the test gateway as TAIA's default runtime instance (DATABASE_URL)
 * and register the OpenClaw factory with the paired test identity, so
 * consumers resolving the runtime through the adapter pool get a connected
 * OpenClaw adapter.
 */
export async function initTestRuntimeAdapter(): Promise<OpenClawAdapter> {
  // DB suites reset the schema; bring it back to the current migration first.
  const { runAllMigrations } = await import('./db/test-db-helper')
  await runAllMigrations()
  const { setSetting, upsertRuntimeInstance } = await import('@taia/core/db')
  await upsertRuntimeInstance({
    id: 'openclaw',
    provider: 'openclaw',
    label: 'openclaw',
    config: { url: getGatewayUrl() },
  })
  await setSetting('runtime.instances.openclaw.token', getGatewayToken())
  await setSetting('runtime.default_instance', 'openclaw')

  // Core's wiring registers OpenClaw with a settings-backed store; swap in
  // the file store that holds the identity approved for the test gateway.
  const { getDefaultRuntimeAdapter, disposeRuntimeAdapter } = await import('@taia/core/runtime')
  registerOpenClawFactory({ credentialStore: () => fileCredentialStore })
  disposeRuntimeAdapter()
  return (await getDefaultRuntimeAdapter()) as OpenClawAdapter
}

// --- Gateway availability (cached) ---

let _gatewayAvailable: boolean | null = null

export async function isGatewayAvailable(): Promise<boolean> {
  if (_gatewayAvailable !== null) return _gatewayAvailable

  try {
    const url = getGatewayUrl().replace(/^ws/, 'http')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3_000)
    const res = await fetch(`${url}/health`, {
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)
    _gatewayAvailable = res.ok
  } catch {
    _gatewayAvailable = false
  }

  return _gatewayAvailable
}

// --- WS connectivity (cached) ---
// Unlike isGatewayAvailable (HTTP health check), this verifies we can
// complete the v4 handshake with the paired test identity. When the gateway
// asks for pairing the tests are skipped (global-setup prints how to approve).

let _wsConnectable: boolean | null = null

export async function isWSConnectable(): Promise<boolean> {
  if (_wsConnectable !== null) return _wsConnectable

  const httpAvail = await isGatewayAvailable()
  if (!httpAvail) {
    _wsConnectable = false
    return false
  }

  const client = createTestClient({ rpcTimeoutMs: 5_000 })
  try {
    await client.connect()
    client.disconnect()
    _wsConnectable = true
  } catch {
    _wsConnectable = false
  }

  return _wsConnectable
}

// --- DB availability (cached) ---

let _dbAvailable: boolean | null = null

export async function isDBAvailable(): Promise<boolean> {
  if (_dbAvailable !== null) return _dbAvailable

  try {
    const { pool } = await import('@taia/core/db/pool')
    const result = await pool.query('SELECT 1')
    _dbAvailable = result.rows.length > 0
  } catch {
    _dbAvailable = false
  }

  return _dbAvailable
}
