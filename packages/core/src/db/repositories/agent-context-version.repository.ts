// Append-only version stores for the three mutable bundle layers.
//
// Each layer (agent identity, project context, user profile) has its own
// table; all share the same shape: { id, owner_fk, content JSONB,
// created_at, created_by, note }. A "save" is always an INSERT; rolling
// back is just inserting another row with the previous content. The active
// version pointer for an agent lives in `agent_context` (separate repo).
//
// Reference: apps/docs/src/content/docs/arquitectura/modelo-de-contexto.md ("Versionado")

import type { AgentIdentity, ProjectContext, UserProfile } from '@taia/types'
import { pool, generateId } from '../pool'

// --- Common helpers ---

function newVersionId(prefix: string): string {
  return `${prefix}_${generateId()}`
}

interface VersionRowBase {
  id: string
  content: unknown
  created_at: string
  created_by: string | null
  note: string | null
}

// --- agent_identity_versions ---

export interface AgentIdentityVersionRow extends VersionRowBase {
  agent_id: string
  content: AgentIdentity
}

export async function insertAgentIdentityVersion(input: {
  agentId: string
  content: AgentIdentity
  createdBy?: string
  note?: string
}): Promise<AgentIdentityVersionRow> {
  const id = newVersionId('aiv')
  const res = await pool.query<AgentIdentityVersionRow>(
    `INSERT INTO agent_identity_versions (id, agent_id, content, created_by, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, input.agentId, JSON.stringify(input.content), input.createdBy ?? null, input.note ?? null],
  )
  return res.rows[0]
}

export async function getAgentIdentityVersion(
  versionId: string,
): Promise<AgentIdentityVersionRow | null> {
  const res = await pool.query<AgentIdentityVersionRow>(
    `SELECT * FROM agent_identity_versions WHERE id = $1`,
    [versionId],
  )
  return res.rows[0] ?? null
}

export async function listAgentIdentityVersions(
  agentId: string,
  limit = 50,
): Promise<AgentIdentityVersionRow[]> {
  const res = await pool.query<AgentIdentityVersionRow>(
    `SELECT * FROM agent_identity_versions
     WHERE agent_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [agentId, limit],
  )
  return res.rows
}

// --- project_context_versions ---

export interface ProjectContextVersionRow extends VersionRowBase {
  project_id: string
  content: ProjectContext
}

export async function insertProjectContextVersion(input: {
  projectId: string
  content: ProjectContext
  createdBy?: string
  note?: string
}): Promise<ProjectContextVersionRow> {
  const id = newVersionId('pcv')
  const res = await pool.query<ProjectContextVersionRow>(
    `INSERT INTO project_context_versions (id, project_id, content, created_by, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      id,
      input.projectId,
      JSON.stringify(input.content),
      input.createdBy ?? null,
      input.note ?? null,
    ],
  )
  return res.rows[0]
}

export async function getProjectContextVersion(
  versionId: string,
): Promise<ProjectContextVersionRow | null> {
  const res = await pool.query<ProjectContextVersionRow>(
    `SELECT * FROM project_context_versions WHERE id = $1`,
    [versionId],
  )
  return res.rows[0] ?? null
}

export async function listProjectContextVersions(
  projectId: string,
  limit = 50,
): Promise<ProjectContextVersionRow[]> {
  const res = await pool.query<ProjectContextVersionRow>(
    `SELECT * FROM project_context_versions
     WHERE project_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [projectId, limit],
  )
  return res.rows
}

/**
 * Most recent active version for a project. Used by the API as the "current"
 * version when no per-agent pin is in play. Distinct from
 * `agent_context.project_context_version_id`, which can pin individual
 * agents to older versions explicitly.
 */
export async function getLatestProjectContextVersion(
  projectId: string,
): Promise<ProjectContextVersionRow | null> {
  const res = await pool.query<ProjectContextVersionRow>(
    `SELECT * FROM project_context_versions
     WHERE project_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [projectId],
  )
  return res.rows[0] ?? null
}

// --- user_profile_versions ---

export interface UserProfileVersionRow extends VersionRowBase {
  user_id: string
  content: UserProfile
}

export async function insertUserProfileVersion(input: {
  userId: string
  content: UserProfile
  createdBy?: string
  note?: string
}): Promise<UserProfileVersionRow> {
  const id = newVersionId('upv')
  const res = await pool.query<UserProfileVersionRow>(
    `INSERT INTO user_profile_versions (id, user_id, content, created_by, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, input.userId, JSON.stringify(input.content), input.createdBy ?? null, input.note ?? null],
  )
  return res.rows[0]
}

export async function getUserProfileVersion(
  versionId: string,
): Promise<UserProfileVersionRow | null> {
  const res = await pool.query<UserProfileVersionRow>(
    `SELECT * FROM user_profile_versions WHERE id = $1`,
    [versionId],
  )
  return res.rows[0] ?? null
}

/**
 * Read the most recent active user profile version (regardless of agent).
 * The user profile is shared across agents in single-user TAIA today.
 */
export async function getLatestUserProfileVersion(
  userId: string,
): Promise<UserProfileVersionRow | null> {
  const res = await pool.query<UserProfileVersionRow>(
    `SELECT * FROM user_profile_versions
     WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  )
  return res.rows[0] ?? null
}

export async function listUserProfileVersions(
  userId: string,
  limit = 50,
): Promise<UserProfileVersionRow[]> {
  const res = await pool.query<UserProfileVersionRow>(
    `SELECT * FROM user_profile_versions
     WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  )
  return res.rows
}
