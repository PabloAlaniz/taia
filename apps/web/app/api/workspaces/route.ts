export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk } from '@taia/core/errors'
import { validate } from '@taia/core/validation/validate'
import { CreateWorkspaceSchema } from '@taia/core/validation/schemas'
import {
  listWorkspaces,
  createWorkspaceFromPreset,
  createCustomWorkspace,
  createWorkspaceWithSetup,
} from '@taia/core/services/workspace.service'

export const GET = withErrorBoundary(async () => {
  const workspaces = await listWorkspaces()
  return apiOk({ workspaces })
})

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = await req.json()
  const data = validate(CreateWorkspaceSchema, body)

  // Unified flow: if columns or new_agents are provided, use the full setup
  if (data.columns || data.new_agents || data.assign_agent_ids) {
    const result = await createWorkspaceWithSetup({
      name: data.name,
      description: data.description,
      icon: data.icon,
      preset_id: data.preset_id,
      columns: data.columns,
      assign_agent_ids: data.assign_agent_ids,
      new_agents: data.new_agents,
    })

    return apiOk({
      workspace: result.workspace,
      columnsCreated: result.columnsCreated,
      agentsAssigned: result.agentsAssigned,
      agentsCreated: result.agentsCreated,
      identitiesCreated: result.identitiesCreated,
      enrichmentStarted: result.enrichmentStarted,
      runtimeProvisioning: result.runtimeProvisioning,
    })
  }

  // Legacy flow: simple preset or custom workspace
  let workspace
  if (data.preset_id) {
    workspace = await createWorkspaceFromPreset(data.name, data.preset_id, {
      description: data.description,
      icon: data.icon,
      color: data.color,
    })
  } else {
    workspace = await createCustomWorkspace(data.name, {
      description: data.description,
      icon: data.icon,
      color: data.color,
    })
  }

  return apiOk({ workspace })
})
