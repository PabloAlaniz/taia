import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockGetRuntimeTargetDiagnostic = vi.fn()

vi.mock('@taia/core/diagnostics/runtime-target', () => ({
  getRuntimeTargetDiagnostic: (...args: unknown[]) => mockGetRuntimeTargetDiagnostic(...args),
}))

import { runtimeTargetTool, runtimeTargetTools } from '../../src/tools/runtime-target-tools'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runtimeTargetTool', () => {
  it('is registered with the expected MCP tool name', () => {
    expect(runtimeTargetTool.name).toBe('taia_runtime_target')
    expect(runtimeTargetTools).toContain(runtimeTargetTool)
  })

  it('returns a diagnostic for the requested workspace', async () => {
    const diagnostic = {
      service: 'mcp',
      workspace_id: 'ws-taia',
      db: { target_hash: 'abc123' },
      workspace: { exists: true, task_count: 3, active_task_count: 1 },
    }
    mockGetRuntimeTargetDiagnostic.mockResolvedValue(diagnostic)

    await expect(runtimeTargetTool.handler({ workspace_id: 'ws-taia' })).resolves.toEqual(
      diagnostic,
    )
    expect(mockGetRuntimeTargetDiagnostic).toHaveBeenCalledWith('mcp', 'ws-taia')
  })

  it('defaults to ws-default when no workspace is provided', async () => {
    mockGetRuntimeTargetDiagnostic.mockResolvedValue({ service: 'mcp', workspace_id: 'ws-default' })

    await runtimeTargetTool.handler({})

    expect(mockGetRuntimeTargetDiagnostic).toHaveBeenCalledWith('mcp', 'ws-default')
  })
})
