// Project repository — extends CrudRepository for standard CRUD.
//
// `glossary` and `knowledge_refs` are first-class JSONB columns. The renderer
// reads them when composing the project layer of the agent context bundle.

import type { KnowledgeRef, Project } from '@taia/types'
import { pool, generateId } from '../pool'
import { CrudRepository } from './base.repository'

/** Extended project row including JSONB fields. */
export interface ProjectRow extends Project {
  glossary?: Record<string, string> | null
  knowledge_refs?: KnowledgeRef[] | null
}

class ProjectRepository extends CrudRepository<Project> {
  constructor() {
    super({
      tableName: 'projects',
      updatableFields: ['name', 'description'],
    })
  }

  /**
   * Every project, or the ones used in `workspaceId`: its home workspace is
   * that one, or it has tasks there. Projects cut across workspaces.
   */
  async getAll(workspaceId?: string): Promise<Project[]> {
    const res = workspaceId
      ? await pool.query(
          `SELECT * FROM projects p
           WHERE p.workspace_id = $1
              OR EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.workspace_id = $1)
           ORDER BY p.name ASC`,
          [workspaceId],
        )
      : await pool.query('SELECT * FROM projects ORDER BY name ASC')
    return res.rows
  }

  async create(data: {
    name: string
    description?: string
    workspace_id?: string
  }): Promise<Project> {
    const id = generateId()
    await pool.query(
      'INSERT INTO projects (id, name, description, workspace_id) VALUES ($1, $2, $3, $4)',
      [id, data.name, data.description || null, data.workspace_id || null],
    )
    return (await this.getById(id))!
  }
}

const repo = new ProjectRepository()

// Function exports for backward compatibility with facade (lib/db/index.ts)
export const getAllProjects = (workspaceId?: string): Promise<Project[]> => repo.getAll(workspaceId)
export const getProjectById = (id: string): Promise<Project | undefined> => repo.getById(id)
export const createProject = (data: {
  name: string
  description?: string
  workspace_id?: string
}): Promise<Project> => repo.create(data)
export const updateProject = (
  id: string,
  updates: Partial<Pick<Project, 'name' | 'description'>>,
): Promise<Project | null> => repo.update(id, updates)
export const deleteProject = (id: string): Promise<boolean> => repo.delete(id)

/**
 * Read a project including JSONB fields (glossary, knowledge_refs).
 * The default `getProjectById` only selects the columns CrudRepository knows
 * about — this is the bundle-aware variant.
 */
export async function getProjectByIdFull(id: string): Promise<ProjectRow | undefined> {
  const res = await pool.query<ProjectRow>(
    `SELECT id, name, description, glossary, knowledge_refs, created_at, updated_at
       FROM projects WHERE id = $1`,
    [id],
  )
  return res.rows[0]
}

/**
 * Update the JSONB fields on a project. Used by saveProjectContext when a
 * new project_context_versions row is recorded — the active glossary /
 * knowledge_refs always reflect the latest version's content.
 */
export async function updateProjectKnowledge(
  id: string,
  updates: { glossary?: Record<string, string>; knowledge_refs?: KnowledgeRef[] },
): Promise<void> {
  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1
  if (updates.glossary !== undefined) {
    fields.push(`glossary = $${idx++}`)
    values.push(JSON.stringify(updates.glossary))
  }
  if (updates.knowledge_refs !== undefined) {
    fields.push(`knowledge_refs = $${idx++}`)
    values.push(JSON.stringify(updates.knowledge_refs))
  }
  if (fields.length === 0) return
  values.push(id)
  await pool.query(`UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx}`, values)
}
