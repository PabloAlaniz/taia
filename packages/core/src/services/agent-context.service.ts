// agent-context.service — append-only writes for the bundle layers.
//
// Each save creates a fresh version row in the matching *_versions table
// and updates the active pointer in agent_context. Edits are never
// destructive: rolling back is just saving the old content as a new
// version. The author of every save is captured for audit (createdBy).
//
// Reference: apps/docs/src/content/docs/arquitectura/modelo-de-contexto.md ("Versionado") and ADR-003 §4.

import type { AgentCapability, AgentIdentity, ProjectContext, UserProfile } from '@taia/types'

/**
 * Default capabilities granted to a newly-created agent. Bias toward "open"
 * — most agents need every TAIA-native action; the constraints field is
 * where humans tighten this per agent. The UI does not edit
 * per-agent capabilities yet.
 */
export const DEFAULT_AGENT_CAPABILITIES: readonly AgentCapability[] = [
  'read_tasks',
  'write_tasks',
  'comment_tasks',
  'read_stats',
  'read_own_files',
  'memory',
]

import {
  ensureAgentContextRow,
  getAgentById,
  getAgentContext,
  getAgentIdentityVersion,
  insertAgentIdentityVersion,
  insertProjectContextVersion,
  insertUserProfileVersion,
  setActiveAgentIdentityVersion,
  setActiveProjectContextVersion,
  setActiveUserProfileVersion,
  updateProjectKnowledge,
} from '../db/index'
import { NotFoundError } from '../errors'
import { eventBus } from '../events/event-bus'

export interface SaveOptions {
  /** Author of the change — user id, 'system', 'enrichment', etc. */
  createdBy?: string
  /** Free-form description of what changed and why. Surfaced in the history UI. */
  note?: string
}

/** Domain event emitted after every identity save. Consumers re-sync runtimes. */
export const AGENT_CONTEXT_CHANGED = 'agent-context:changed'

export interface AgentContextChangedPayload {
  agentId: string
  layer: 'agent_identity'
  versionId: string
}

/** Identity for a freshly created agent: no persona or instructions yet. */
export function buildInitialIdentity(agent: {
  id: string
  name: string
  role: string
}): AgentIdentity {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    persona: '',
    instructions: '',
    capabilities: [...DEFAULT_AGENT_CAPABILITIES],
  }
}

/**
 * Save a new version of an agent's identity and flip the active pointer.
 * Returns the new version id so the caller can record audit metadata.
 */
export async function saveAgentIdentity(
  agentId: string,
  content: AgentIdentity,
  options: SaveOptions = {},
): Promise<{ versionId: string }> {
  await ensureAgentContextRow(agentId)
  const row = await insertAgentIdentityVersion({
    agentId,
    content,
    createdBy: options.createdBy,
    note: options.note,
  })
  await setActiveAgentIdentityVersion(agentId, row.id)

  const payload: AgentContextChangedPayload = {
    agentId,
    layer: 'agent_identity',
    versionId: row.id,
  }
  await eventBus.emit({
    type: AGENT_CONTEXT_CHANGED,
    payload: { ...payload },
    timestamp: Date.now(),
    actor: options.createdBy ?? 'system',
  })

  return { versionId: row.id }
}

/** The agent's active identity, or undefined when it has none. */
export async function getActiveIdentity(agentId: string): Promise<AgentIdentity | undefined> {
  const ctx = await getAgentContext(agentId)
  if (!ctx?.agent_identity_version_id) return undefined
  return (await getAgentIdentityVersion(ctx.agent_identity_version_id))?.content
}

/**
 * Apply a partial edit to an agent's identity: merges over the active
 * version (or the agent row when there is none) and saves a new version.
 */
export async function updateAgentIdentity(
  agentId: string,
  patch: Partial<AgentIdentity>,
  options: SaveOptions = {},
): Promise<{ versionId: string; identity: AgentIdentity }> {
  const agent = await getAgentById(agentId)
  if (!agent) throw new NotFoundError('Agent', agentId)

  const current = await getActiveIdentity(agentId)
  const identity: AgentIdentity = {
    id: agent.id,
    name: patch.name ?? current?.name ?? agent.name,
    role: patch.role ?? current?.role ?? agent.role ?? 'Agent',
    persona: patch.persona ?? current?.persona ?? '',
    instructions: patch.instructions ?? current?.instructions ?? '',
    capabilities: patch.capabilities ?? current?.capabilities ?? [...DEFAULT_AGENT_CAPABILITIES],
    constraints: patch.constraints ?? current?.constraints,
  }

  const { versionId } = await saveAgentIdentity(agentId, identity, options)
  return { versionId, identity }
}

/**
 * Roll back to a prior identity version by saving its content as a new
 * active version (append-only — history is never rewritten).
 */
export async function restoreAgentIdentity(
  agentId: string,
  versionId: string,
  options: SaveOptions = {},
): Promise<{ versionId: string; identity: AgentIdentity }> {
  const target = await getAgentIdentityVersion(versionId)
  if (!target || target.agent_id !== agentId) {
    throw new NotFoundError('Agent identity version', versionId)
  }
  const result = await saveAgentIdentity(agentId, target.content, {
    note: `Restored from ${versionId}`,
    ...options,
  })
  return { versionId: result.versionId, identity: target.content }
}

/**
 * Save a new version of a project's context. Also syncs the project row's
 * `glossary` / `knowledge_refs` JSONB columns so non-bundle readers
 * (existing UI, repositories) see the latest values without joining the
 * version table.
 */
export async function saveProjectContext(
  projectId: string,
  content: ProjectContext,
  options: SaveOptions = {},
): Promise<{ versionId: string }> {
  const row = await insertProjectContextVersion({
    projectId,
    content,
    createdBy: options.createdBy,
    note: options.note,
  })
  // Bridge bundle camelCase → DB snake_case at the boundary.
  await updateProjectKnowledge(projectId, {
    glossary: content.glossary,
    knowledge_refs: content.knowledgeRefs,
  })
  return { versionId: row.id }
}

/**
 * Save a new version of a user profile. Caller assigns the user_id (today
 * always 'default' since TAIA is single-user). Pointer per agent is set
 * separately with `setUserProfileForAgent`.
 */
export async function saveUserProfile(
  userId: string,
  content: UserProfile,
  options: SaveOptions = {},
): Promise<{ versionId: string }> {
  const row = await insertUserProfileVersion({
    userId,
    content,
    createdBy: options.createdBy,
    note: options.note,
  })
  return { versionId: row.id }
}

/**
 * Point an agent's context at an existing project_context_versions row.
 * Used after `saveProjectContext` when the project a particular agent
 * uses gains a new version, or to rollback to a prior version.
 */
export async function setProjectContextForAgent(agentId: string, versionId: string): Promise<void> {
  await ensureAgentContextRow(agentId)
  await setActiveProjectContextVersion(agentId, versionId)
}

export async function setUserProfileForAgent(agentId: string, versionId: string): Promise<void> {
  await ensureAgentContextRow(agentId)
  await setActiveUserProfileVersion(agentId, versionId)
}

/**
 * Read the active version IDs for an agent's bundle. Persisted on
 * `runtime_sessions.bundle_version_ids` at spawn time so a misbehaving run
 * can be correlated with the exact versions it consumed.
 *
 * Returns an empty object when the agent has no agent_context row yet —
 * the spawn audit trail will be NULL and the resolver falls back to the
 * derivation path.
 */
export async function getActiveBundleVersionIds(agentId: string): Promise<Record<string, string>> {
  const row = await getAgentContext(agentId)
  if (!row) return {}
  const ids: Record<string, string> = {}
  if (row.agent_identity_version_id) ids.agent_identity = row.agent_identity_version_id
  if (row.project_context_version_id) ids.project_context = row.project_context_version_id
  if (row.user_profile_version_id) ids.user_profile = row.user_profile_version_id
  return ids
}
