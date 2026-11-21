// Integration: gateway protocol v4 handshake and connection lifecycle

import { createTestClient, isWSConnectable } from '../setup'
import { OpenClawGatewayError, OpenClawPairingRequiredError } from '@taia/runtime/adapters/openclaw'
import type { ConnectionState } from '@taia/runtime/adapters/openclaw/types'

const skipAll = !(await isWSConnectable())
if (skipAll) console.warn('⚠ WS not connectable — skipping connection tests')

describe.skipIf(skipAll)('OpenClawClient — Connection', () => {
  it('completes challenge → connect → hello-ok on protocol v4', async () => {
    const client = createTestClient()
    try {
      await client.connect()
      expect(client.getState()).toBe('connected')
      const info = client.getConnectionInfo()
      expect(info.protocol).toBe(4)
      expect(info.scopes).toEqual(expect.arrayContaining(['operator.read', 'operator.write']))
      expect(info.deviceId).toMatch(/^[0-9a-f]{64}$/)
    } finally {
      client.disconnect()
    }
  })

  it('state transitions: connecting → connected → disconnected', async () => {
    const client = createTestClient()
    const states: ConnectionState[] = []
    client.onStateChange((s) => states.push(s))

    await client.connect()
    client.disconnect()

    expect(states).toEqual(['connecting', 'connected', 'disconnected'])
  })

  it('connect() is idempotent while connected', async () => {
    const client = createTestClient()
    try {
      await client.connect()
      await client.connect()
      expect(client.getState()).toBe('connected')
    } finally {
      client.disconnect()
    }
  })

  it('an unpaired device with a wrong token is rejected', async () => {
    const client = createTestClient({
      token: `invalid-token-${Date.now()}`,
      credentialStore: null,
      rpcTimeoutMs: 5_000,
    })

    const error = await client.connect().catch((e) => e)

    expect(
      error instanceof OpenClawGatewayError || error instanceof OpenClawPairingRequiredError,
    ).toBe(true)
    expect(client.getState()).toBe('disconnected')
  })
})
