// Workspace service — business logic for workspace management

import {
  getAllWorkspaces,
  getWorkspaceById,
  getDefaultWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getColumnsForWorkspace,
  createColumn,
  getDoneStateSlugs,
  getInitialSlug,
  addAgentToWorkspace,
  getAllAgents,
  createAgent,
} from '../db/index'
import { pool } from '../db/pool'
import type { RuntimeProvisioningReport } from './agent-runtime-settings.service'
import type {
  Workspace,
  BoardColumn,
  WorkspacePreset,
  WorkspacePresetColumn,
  AgentType,
} from '@taia/types'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return getAllWorkspaces()
}

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  return getWorkspaceById(id)
}

export async function getOrCreateDefault(): Promise<Workspace> {
  const existing = await getDefaultWorkspace()
  if (existing) return existing
  // Should not happen after migration, but safety net
  return createWorkspace({ name: 'Default', slug: 'default' })
}

/**
 * The seeded default workspace while nobody has set it up: the only
 * workspace, with no columns and no tasks.
 */
async function unusedDefaultWorkspace(): Promise<Workspace | undefined> {
  const workspaces = await getAllWorkspaces()
  if (workspaces.length !== 1 || !workspaces[0].is_default) return undefined
  const candidate = workspaces[0]
  if ((await getColumnsForWorkspace(candidate.id)).length > 0) return undefined
  const tasks = await pool.query('SELECT 1 FROM tasks WHERE workspace_id = $1 LIMIT 1', [
    candidate.id,
  ])
  return tasks.rows.length > 0 ? undefined : candidate
}

/**
 * Creates a workspace that is about to get its columns. The first one takes
 * over the empty default workspace instead of sitting next to it: the API,
 * the MCP tools and the CLI fall back to the default workspace, and so does a
 * browser that hasn't picked one, so that is where the first board has to be.
 */
async function createFirstOrNewWorkspace(data: {
  name: string
  slug: string
  description?: string
  icon?: string
  color?: string
}): Promise<Workspace> {
  const unused = await unusedDefaultWorkspace()
  const claimed = unused
    ? await updateWorkspace(unused.id, {
        name: data.name,
        description: data.description,
        ...(data.icon ? { icon: data.icon } : {}),
        ...(data.color ? { color: data.color } : {}),
      })
    : null
  return claimed ?? createWorkspace(data)
}

export async function createWorkspaceFromPreset(
  name: string,
  presetId: string,
  options?: { description?: string; icon?: string; color?: string },
): Promise<Workspace> {
  // Fetch preset
  const presetRes = await pool.query('SELECT * FROM workspace_presets WHERE id = $1', [presetId])
  const preset = presetRes.rows[0] as WorkspacePreset | undefined
  if (!preset) {
    throw new Error(`Preset not found: ${presetId}`)
  }

  const columns: WorkspacePresetColumn[] =
    typeof preset.columns === 'string' ? JSON.parse(preset.columns) : preset.columns

  const slug = slugify(name)
  const workspace = await createFirstOrNewWorkspace({
    name,
    slug,
    description: options?.description,
    icon: options?.icon || preset.icon,
    color: options?.color,
  })

  // Create columns from preset
  for (const col of columns) {
    await createColumn(workspace.id, {
      slug: col.slug,
      label: col.label,
      icon: col.icon,
      is_done_state: col.is_done_state,
      is_initial_state: col.is_initial_state,
    })
  }

  // Auto-assign all agents to new workspace
  const agents = await getAllAgents()
  for (const agent of agents) {
    await addAgentToWorkspace(workspace.id, agent.id)
  }

  return workspace
}

export async function createCustomWorkspace(
  name: string,
  options?: { description?: string; icon?: string; color?: string },
): Promise<Workspace> {
  const slug = slugify(name)
  return createWorkspace({
    name,
    slug,
    description: options?.description,
    icon: options?.icon,
    color: options?.color,
  })
}

export async function updateExistingWorkspace(
  id: string,
  updates: Partial<Pick<Workspace, 'name' | 'description' | 'icon' | 'color'>>,
): Promise<Workspace | null> {
  return updateWorkspace(id, updates)
}

export async function deleteExistingWorkspace(id: string): Promise<boolean> {
  return deleteWorkspace(id)
}

export async function getWorkspaceColumns(workspaceId: string): Promise<BoardColumn[]> {
  return getColumnsForWorkspace(workspaceId)
}

export async function getWorkspaceDoneSlugs(workspaceId: string): Promise<string[]> {
  return getDoneStateSlugs(workspaceId)
}

export async function getWorkspaceInitialSlug(workspaceId: string): Promise<string> {
  const slug = await getInitialSlug(workspaceId)
  return slug || 'INBOX'
}

export async function isDoneStatus(workspaceId: string, status: string): Promise<boolean> {
  const doneSlugs = await getDoneStateSlugs(workspaceId)
  return doneSlugs.includes(status)
}

export async function listPresets(): Promise<WorkspacePreset[]> {
  const res = await pool.query('SELECT * FROM workspace_presets ORDER BY name')
  return res.rows.map((row) => ({
    ...row,
    columns: typeof row.columns === 'string' ? JSON.parse(row.columns) : row.columns,
  }))
}

// === Unified workspace creation ===

export interface ColumnInput {
  slug: string
  label: string
  icon: string
  is_initial_state: boolean
  is_done_state: boolean
}

export interface NewAgentInput {
  id: string
  name: string
  role: string
  avatar?: string
  type?: AgentType
  cron_schedule?: string
}

export interface CreateWorkspaceWithSetupInput {
  name: string
  description?: string
  icon?: string
  preset_id?: string
  columns?: ColumnInput[]
  assign_agent_ids?: string[]
  new_agents?: NewAgentInput[]
}

export interface WorkspaceSetupResult {
  workspace: Workspace
  columnsCreated: number
  agentsAssigned: number
  agentsCreated: number
  identitiesCreated: number
  enrichmentStarted: boolean
  runtimeProvisioning: RuntimeProvisioningReport | null
}

export async function createWorkspaceWithSetup(
  input: CreateWorkspaceWithSetupInput,
): Promise<WorkspaceSetupResult> {
  const slug = slugify(input.name)

  // 1. Create workspace (or set up the empty default one)
  const willHaveColumns = !!input.preset_id || (input.columns?.length ?? 0) > 0
  const data = { name: input.name, slug, description: input.description, icon: input.icon }
  const workspace = willHaveColumns
    ? await createFirstOrNewWorkspace(data)
    : await createWorkspace(data)

  // 2. Create columns (from preset OR custom)
  let columnsCreated = 0

  if (input.preset_id) {
    const presetRes = await pool.query('SELECT * FROM workspace_presets WHERE id = $1', [
      input.preset_id,
    ])
    const preset = presetRes.rows[0] as WorkspacePreset | undefined
    if (preset) {
      const columns: WorkspacePresetColumn[] =
        typeof preset.columns === 'string' ? JSON.parse(preset.columns) : preset.columns
      if (!input.icon) {
        await updateWorkspace(workspace.id, { icon: preset.icon })
      }
      for (const col of columns) {
        await createColumn(workspace.id, {
          slug: col.slug,
          label: col.label,
          icon: col.icon,
          is_done_state: col.is_done_state,
          is_initial_state: col.is_initial_state,
        })
        columnsCreated++
      }
    }
  } else if (input.columns && input.columns.length > 0) {
    for (const col of input.columns) {
      await createColumn(workspace.id, {
        slug: col.slug,
        label: col.label,
        icon: col.icon,
        is_done_state: col.is_done_state,
        is_initial_state: col.is_initial_state,
      })
      columnsCreated++
    }
  }

  // 3. Assign existing agents
  let agentsAssigned = 0
  for (const agentId of input.assign_agent_ids || []) {
    await addAgentToWorkspace(workspace.id, agentId)
    agentsAssigned++
  }

  // 4. Create new agents
  let agentsCreated = 0
  let identitiesCreated = 0
  const existingAgents = await getAllAgents(true)
  const existingIds = new Set(existingAgents.map((a) => a.id))

  for (const agent of input.new_agents || []) {
    if (!existingIds.has(agent.id)) {
      await createAgent({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        avatar: agent.avatar || '🤖',
        type: agent.type || 'cron',
        config: agent.cron_schedule ? { cron_schedule: agent.cron_schedule } : undefined,
      })
      agentsCreated++
    }

    // Seed a clean typed identity; each runtime renders it (ADR-005).
    const { saveAgentIdentity, buildInitialIdentity } = await import('./agent-context.service')
    await saveAgentIdentity(agent.id, buildInitialIdentity(agent), {
      createdBy: 'workspace-setup',
      note: 'Initial identity from workspace creation',
    })
    identitiesCreated++

    await addAgentToWorkspace(workspace.id, agent.id)
  }

  // 5. Create the new agents in the runtime + enrichment
  let runtimeProvisioning: WorkspaceSetupResult['runtimeProvisioning'] = null
  let enrichmentStarted = false

  if ((input.new_agents || []).length > 0) {
    const { provisionAgentsInRuntime } = await import('./agent-runtime-settings.service')
    runtimeProvisioning = await provisionAgentsInRuntime(input.new_agents!)

    try {
      const { enrichAgentIdentities } = await import('./enrichment.service')
      enrichAgentIdentities(input.new_agents!).catch((err) => {
        console.warn('[workspace] Background enrichment failed:', err.message)
      })
      enrichmentStarted = true
    } catch {
      // Enrichment is optional
    }
  }

  return {
    workspace,
    columnsCreated,
    agentsAssigned,
    agentsCreated,
    identitiesCreated,
    enrichmentStarted,
    runtimeProvisioning,
  }
}
