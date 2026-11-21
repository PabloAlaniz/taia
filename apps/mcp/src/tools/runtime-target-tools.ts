import { z } from 'zod'
import { getRuntimeTargetDiagnostic } from '@taia/core/diagnostics/runtime-target'
import type { ToolDefinition } from '../tool-registry'

export const runtimeTargetTool: ToolDefinition = {
  name: 'taia_runtime_target',
  description:
    'Diagnose the effective TAIA runtime target: workspace visibility and datastore identity for stale-server checks.',
  params: {
    workspace_id: z.string().optional().describe('Workspace ID to verify (defaults to ws-default)'),
  },
  handler: async ({ workspace_id }) => {
    return getRuntimeTargetDiagnostic('mcp', workspace_id || 'ws-default')
  },
}

export const runtimeTargetTools: ToolDefinition[] = [runtimeTargetTool]
