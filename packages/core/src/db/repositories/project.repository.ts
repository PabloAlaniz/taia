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

/** What the projects list shows per project, across every workspace. */
export interface ProjectSummary {
  project_id: string
  total_tasks: number
  done_tasks: number
  workspaces: number
  cost_usd: number
  last_activity: string | null
}

/**
 * Task counts, workspaces, spend and last activity for every project, in two
 * queries. "Done" follows each workspace's own done column.
 */
export async function getProjectSummaries(): Promise<ProjectSummary[]> {
  const [tasks, costs] = await Promise.all([
    pool.query(
      `SELECT p.id AS project_id,
              COUNT(t.id) AS total_tasks,
              COUNT(t.id) FILTER (WHERE bc.is_done_state) AS done_tasks,
              COUNT(DISTINCT t.workspace_id) AS workspaces,
              MAX(t.updated_at) AS last_activity
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
       LEFT JOIN board_columns bc ON bc.workspace_id = t.workspace_id AND bc.slug = t.status
       GROUP BY p.id`,
    ),
    pool.query(
      `SELECT t.project_id, COALESCE(SUM(sc.estimated_cost_usd), 0) AS cost_usd
       FROM session_costs sc JOIN tasks t ON t.id = sc.task_id
       WHERE t.project_id IS NOT NULL
       GROUP BY t.project_id`,
    ),
  ])
  const costByProject = new Map<string, number>(
    costs.rows.map((r) => [r.project_id as string, Number(r.cost_usd)]),
  )
  return tasks.rows.map((r) => ({
    project_id: r.project_id,
    total_tasks: Number(r.total_tasks),
    done_tasks: Number(r.done_tasks),
    workspaces: Number(r.workspaces),
    cost_usd: costByProject.get(r.project_id) ?? 0,
    last_activity: r.last_activity ? new Date(r.last_activity).toISOString() : null,
  }))
}
