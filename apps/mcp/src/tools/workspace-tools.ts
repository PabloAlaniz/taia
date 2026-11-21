import { z } from 'zod'
import type { ToolDefinition } from '../tool-registry'
import { getAllWorkspaces, getColumnsForWorkspace } from '@taia/core/db'
import {
  createWorkspaceFromPreset,
  updateExistingWorkspace,
  deleteExistingWorkspace,
  listPresets,
} from '@taia/core/services/workspace.service'

export const listWorkspacesTool: ToolDefinition = {
  name: 'taia_list_workspaces',
  description: 'List all workspaces configured in TAIA',
  params: {},
  handler: async () => {
    const workspaces = await getAllWorkspaces()
    return {
      workspaces: workspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        icon: ws.icon,
        is_default: ws.is_default,
      })),
    }
  },
}

export const getWorkspaceColumnsTool: ToolDefinition = {
  name: 'taia_get_workspace_columns',
  description: 'Get the board columns for a specific workspace',
  params: {
    workspace_id: z.string().optional().describe('Workspace ID (defaults to ws-default)'),
  },
  handler: async ({ workspace_id }) => {
    const wsId = workspace_id || 'ws-default'
    const columns = await getColumnsForWorkspace(wsId)
    return {
      workspace_id: wsId,
      columns: columns.map((c) => ({
        slug: c.slug,
        label: c.label,
        icon: c.icon,
        position: c.position,
        is_done_state: c.is_done_state,
        is_initial_state: c.is_initial_state,
      })),
    }
  },
}

export const listPresetsTool: ToolDefinition = {
  name: 'taia_list_presets',
  description:
    'List the available workspace presets. Use one of the returned ids as preset_id in taia_create_workspace.',
  params: {},
  handler: async () => {
    const presets = await listPresets()
    return {
      presets: presets.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        icon: p.icon,
        columns: p.columns.map((c) => c.slug),
      })),
    }
  },
}

export const createWorkspaceTool: ToolDefinition = {
  name: 'taia_create_workspace',
  description: 'Create a new workspace from a preset',
  params: {
    name: z.string().describe('Workspace name'),
    preset_id: z
      .string()
      .describe(
        'Preset id (call taia_list_presets to discover valid ids, e.g. preset-software-dev)',
      ),
    description: z.string().optional().describe('Workspace description'),
    icon: z.string().optional().describe('Workspace icon'),
    color: z.string().optional().describe('Workspace color'),
  },
  handler: async ({ name, preset_id, description, icon, color }) => {
    const workspace = await createWorkspaceFromPreset(name, preset_id, { description, icon, color })
    return {
      created: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        icon: workspace.icon,
      },
    }
  },
}

export const updateWorkspaceTool: ToolDefinition = {
  name: 'taia_update_workspace',
  description: 'Update an existing workspace',
  params: {
    workspace_id: z.string().describe('Workspace ID'),
    name: z.string().optional().describe('New workspace name'),
    description: z.string().optional().describe('New description'),
    icon: z.string().optional().describe('New icon'),
    color: z.string().optional().describe('New color'),
  },
  handler: async ({ workspace_id, name, description, icon, color }) => {
    const workspace = await updateExistingWorkspace(workspace_id, {
      name,
      description,
      icon,
      color,
    })
    if (!workspace) throw new Error(`Workspace ${workspace_id} not found`)
    return { updated: true, workspace }
  },
}

export const deleteWorkspaceTool: ToolDefinition = {
  name: 'taia_delete_workspace',
  description: 'Delete a workspace',
  params: {
    workspace_id: z.string().describe('Workspace ID'),
  },
  handler: async ({ workspace_id }) => {
    await deleteExistingWorkspace(workspace_id)
    return { deleted: true }
  },
}

export const workspaceTools: ToolDefinition[] = [
  listWorkspacesTool,
  getWorkspaceColumnsTool,
  listPresetsTool,
  createWorkspaceTool,
  updateWorkspaceTool,
  deleteWorkspaceTool,
]
