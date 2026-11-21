// Minimal in-memory adapter used to validate the contract suite. Lives in
// __tests__ on purpose: it is NOT a shipping adapter, it exists so the
// abstraction is exercised against more than one implementation.

import {
  CapabilitySet,
  RuntimeCapability,
  type AgentRuntimeAdapter,
  type RuntimeAgent,
  type RuntimeConnectionState,
  type RuntimeHealth,
  type RuntimeProviderDefaults,
  type RuntimeSession,
  type SpawnOptions,
  type SpawnResult,
} from '@taia/runtime'

export class MockRuntimeAdapter implements AgentRuntimeAdapter {
  readonly id = 'mock'
  readonly capabilities = new CapabilitySet([RuntimeCapability.Sessions, RuntimeCapability.Health])

  private sessions: RuntimeSession[] = []
  private state: RuntimeConnectionState = 'disconnected'
  private nextRunId = 1

  async isAvailable(): Promise<boolean> {
    this.state = 'connected'
    return true
  }

  getConnectionState(): RuntimeConnectionState {
    return this.state
  }

  onConnectionStateChange(_handler: (state: RuntimeConnectionState) => void): () => void {
    return () => {}
  }

  async listAgents(): Promise<RuntimeAgent[]> {
    return [
      { id: 'mock-1', name: 'Mock Agent 1', configured: true },
      { id: 'mock-2', name: 'Mock Agent 2', configured: true },
    ]
  }

  async getHealth(): Promise<RuntimeHealth> {
    return { ok: true, agents: 2 }
  }

  getProviderDefaults(): RuntimeProviderDefaults {
    return { workspaceRoot: '/tmp/mock-workspace' }
  }

  async spawnSession(_task: string, options?: SpawnOptions): Promise<SpawnResult> {
    const runId = `mock-run-${this.nextRunId++}`
    const sessionKey = `agent:${options?.agentId ?? 'mock-1'}:${runId}`
    this.sessions.push({
      key: sessionKey,
      kind: 'agent',
      sessionId: runId,
      updatedAt: Date.now(),
      label: options?.label,
    })
    return { status: 'accepted', runId, sessionKey }
  }

  async listSessions(): Promise<RuntimeSession[]> {
    return [...this.sessions]
  }
}

export function createMockAdapter(): MockRuntimeAdapter {
  return new MockRuntimeAdapter()
}
