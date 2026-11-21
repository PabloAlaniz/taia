// Agent memory repository — backing store for the Anthropic memory tool.
//
// Scoped by (agent_id, path). Path is opaque (the model decides). The
// memory tool's 6 commands (view/create/str_replace/insert/delete/rename)
// are implemented in the adapter executor; this repo is the
// persistence layer.

import { createHash } from 'crypto'
import { pool, generateId } from '../pool'

export interface AgentMemoryRow {
  id: string
  agent_id: string
  path: string
  content: string
  content_sha256: string | null
  created_at: string
  updated_at: string
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/** Read a single memory by (agent_id, path). Returns null when missing. */
export async function getAgentMemory(
  agentId: string,
  path: string,
): Promise<AgentMemoryRow | null> {
  const res = await pool.query<AgentMemoryRow>(
    `SELECT * FROM agent_memory WHERE agent_id = $1 AND path = $2`,
    [agentId, path],
  )
  return res.rows[0] ?? null
}

/**
 * List all memories for an agent. Optionally filter by a path prefix
 * (e.g. "/notes/" matches "/notes/a.md" but not "/notes_backup/"). Returns
 * rows sorted by path ascending.
 */
export async function listAgentMemories(
  agentId: string,
  options?: { pathPrefix?: string },
): Promise<AgentMemoryRow[]> {
  if (options?.pathPrefix) {
    const res = await pool.query<AgentMemoryRow>(
      `SELECT * FROM agent_memory
       WHERE agent_id = $1 AND path LIKE $2
       ORDER BY path ASC`,
      [agentId, `${options.pathPrefix}%`],
    )
    return res.rows
  }
  const res = await pool.query<AgentMemoryRow>(
    `SELECT * FROM agent_memory WHERE agent_id = $1 ORDER BY path ASC`,
    [agentId],
  )
  return res.rows
}

/**
 * Create a new memory at the given path. Throws when the path is already
 * occupied — callers (e.g. the create command) should check beforehand and
 * surface a path_conflict error to the model.
 */
export async function createAgentMemory(input: {
  agentId: string
  path: string
  content: string
}): Promise<AgentMemoryRow> {
  const id = generateId()
  const res = await pool.query<AgentMemoryRow>(
    `INSERT INTO agent_memory (id, agent_id, path, content, content_sha256)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, input.agentId, input.path, input.content, sha256(input.content)],
  )
  return res.rows[0]
}

/**
 * Replace the content of an existing memory. Returns null when the row
 * doesn't exist (so the executor can return a not_found error to the model).
 */
export async function updateAgentMemoryContent(
  agentId: string,
  path: string,
  content: string,
): Promise<AgentMemoryRow | null> {
  const res = await pool.query<AgentMemoryRow>(
    `UPDATE agent_memory
       SET content = $3, content_sha256 = $4, updated_at = NOW()
     WHERE agent_id = $1 AND path = $2
     RETURNING *`,
    [agentId, path, content, sha256(content)],
  )
  return res.rows[0] ?? null
}

/** Rename a memory to a new path. Returns null when source doesn't exist. */
export async function renameAgentMemory(
  agentId: string,
  oldPath: string,
  newPath: string,
): Promise<AgentMemoryRow | null> {
  const res = await pool.query<AgentMemoryRow>(
    `UPDATE agent_memory
       SET path = $3, updated_at = NOW()
     WHERE agent_id = $1 AND path = $2
     RETURNING *`,
    [agentId, oldPath, newPath],
  )
  return res.rows[0] ?? null
}

/** Delete a memory. Returns true when a row was removed, false otherwise. */
export async function deleteAgentMemory(agentId: string, path: string): Promise<boolean> {
  const res = await pool.query(`DELETE FROM agent_memory WHERE agent_id = $1 AND path = $2`, [
    agentId,
    path,
  ])
  return (res.rowCount || 0) > 0
}

/** Create or replace a memory at `path` (used by the HTTP memory route). */
export async function upsertAgentMemory(
  agentId: string,
  path: string,
  content: string,
): Promise<AgentMemoryRow> {
  const res = await pool.query<AgentMemoryRow>(
    `INSERT INTO agent_memory (id, agent_id, path, content, content_sha256)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (agent_id, path) DO UPDATE
       SET content = EXCLUDED.content,
           content_sha256 = EXCLUDED.content_sha256,
           updated_at = NOW()
     RETURNING *`,
    [generateId(), agentId, path, content, sha256(content)],
  )
  return res.rows[0]
}
