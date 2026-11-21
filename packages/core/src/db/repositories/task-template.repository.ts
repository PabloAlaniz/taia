// Task template repository — extends CrudRepository with normalize hook

import type { TaskTemplate } from '@taia/types'
import { pool, generateId } from '../pool'
import { CrudRepository } from './base.repository'

function normalizeTemplate(row: Record<string, unknown>): TaskTemplate {
  return {
    ...(row as object),
    default_tags: row.default_tags || [],
    is_default: Boolean(row.is_default),
  } as TaskTemplate
}

class TaskTemplateRepository extends CrudRepository<TaskTemplate> {
  constructor() {
    super({
      tableName: 'task_templates',
      updatableFields: [
        'name',
        'description',
        'default_status',
        'default_priority',
        'default_project',
        'default_assigned_to',
        'default_tags',
      ],
      normalize: normalizeTemplate,
    })
  }

  /**
   * Every template, or the ones a workspace can use: its own plus the shared
   * ones (the built-in defaults and those that belong to no workspace).
   */
  async getAll(workspaceId?: string): Promise<TaskTemplate[]> {
    const res = workspaceId
      ? await pool.query(
          `SELECT * FROM task_templates
           WHERE workspace_id = $1 OR workspace_id IS NULL OR is_default = TRUE
           ORDER BY is_default DESC, name ASC`,
          [workspaceId],
        )
      : await pool.query('SELECT * FROM task_templates ORDER BY is_default DESC, name ASC')
    return res.rows.map(normalizeTemplate)
  }

  async create(data: {
    name: string
    description?: string
    default_status?: string
    default_priority?: string
    default_project?: string
    default_assigned_to?: string
    default_tags?: string[]
    workspace_id?: string
  }): Promise<TaskTemplate> {
    const id = generateId()
    await pool.query(
      `INSERT INTO task_templates (id, name, description, default_status, default_priority, default_project, default_assigned_to, default_tags, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        data.name,
        data.description || null,
        data.default_status || 'INBOX',
        data.default_priority || 'MEDIUM',
        data.default_project || null,
        data.default_assigned_to || null,
        data.default_tags || [],
        data.workspace_id || null,
      ],
    )
    return (await this.getById(id))!
  }
}

const repo = new TaskTemplateRepository()

// Function exports for backward compatibility with facade
export const getAllTemplates = (workspaceId?: string): Promise<TaskTemplate[]> =>
  repo.getAll(workspaceId)
export const getTemplateById = (id: string): Promise<TaskTemplate | undefined> => repo.getById(id)
export const createTemplate = (data: Parameters<typeof repo.create>[0]): Promise<TaskTemplate> =>
  repo.create(data)
export const updateTemplate = (
  id: string,
  updates: Partial<Omit<TaskTemplate, 'id' | 'created_at' | 'updated_at' | 'is_default'>>,
): Promise<TaskTemplate | null> => repo.update(id, updates)
export const deleteTemplate = (id: string): Promise<boolean> => repo.delete(id)
