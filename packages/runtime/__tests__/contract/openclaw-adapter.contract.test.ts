import { vi } from 'vitest'
import { OpenClawAdapter } from '@taia/runtime/adapters/openclaw'
import type { OpenClawClient } from '@taia/runtime/adapters/openclaw/client'
import { runAdapterContract } from './adapter-contract'

function makeFakeClient(): OpenClawClient {
  let runIdSeq = 0
  return {
    listAgents: vi.fn().mockResolvedValue([
      { id: 'a1', name: 'Agent 1' },
      { id: 'a2', name: 'Agent 2' },
    ]),
    listSessions: vi.fn().mockResolvedValue([]),
    getSessionHistory: vi.fn().mockResolvedValue([]),
    spawnSession: vi.fn(async () => ({
      key: `agent:a1:run-${++runIdSeq}`,
      runId: `run-${runIdSeq}`,
      runStarted: true,
    })),
    sendToSession: vi.fn().mockResolvedValue({ runId: 'r', status: 'started' }),
    listCrons: vi.fn().mockResolvedValue([]),
    cronAction: vi.fn().mockResolvedValue({}),
    getGatewayConfig: vi.fn().mockResolvedValue({ config: { agents: { entries: {} } } }),
    configPatch: vi.fn().mockResolvedValue({}),
    getHealth: vi.fn().mockResolvedValue({ ok: true }),
    on: vi.fn().mockReturnValue(() => {}),
    onStateChange: vi.fn().mockReturnValue(() => {}),
    getState: vi.fn().mockReturnValue('connected'),
    connect: vi.fn().mockResolvedValue(undefined),
    getConnectionInfo: vi.fn().mockReturnValue({ protocol: 4 }),
    sendChannelMessage: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    awaitSessionComplete: vi.fn().mockResolvedValue(undefined),
  } as unknown as OpenClawClient
}

runAdapterContract({
  name: 'OpenClawAdapter (with fake client)',
  makeAdapter: () => new OpenClawAdapter(makeFakeClient()),
})
