import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  generateId: vi.fn(() => 'test-id-123'),
}))

beforeEach(() => vi.clearAllMocks())

import {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '@taia/core/db/repositories/task-template.repository'

describe('task-template.repository', () => {
  const rawRow = {
    id: 'tpl-1',
    name: 'Bug Report',
    description: 'Template for bugs',
    default_status: 'INBOX',
    default_priority: 'HIGH',
    default_project: 'core',
    default_assigned_to: 'agent-a',
    default_tags: ['bug', 'critical'],
    is_default: true,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
  }

  // ---------------------------------------------------------------
  // getAllTemplates
  // ---------------------------------------------------------------
  describe('getAllTemplates', () => {
    it('returns normalized templates ordered by is_default DESC, name ASC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })

      const result = await getAllTemplates()

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM task_templates ORDER BY is_default DESC, name ASC',
      )
      expect(result).toHaveLength(1)
      expect(result[0].is_default).toBe(true)
      expect(result[0].default_tags).toEqual(['bug', 'critical'])
    })

    it('returns empty array when no templates', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getAllTemplates()

      expect(result).toEqual([])
    })

    it('normalizes falsy default_tags to empty array', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...rawRow, default_tags: null }],
      })

      const result = await getAllTemplates()

      expect(result[0].default_tags).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getTemplateById
  // ---------------------------------------------------------------
  describe('getTemplateById', () => {
    it('returns normalized template when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })

      const result = await getTemplateById('tpl-1')

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM task_templates WHERE id = $1', [
        'tpl-1',
      ])
      expect(result).toBeDefined()
      expect(result!.name).toBe('Bug Report')
    })

    it('returns undefined when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getTemplateById('nonexistent')

      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // createTemplate
  // ---------------------------------------------------------------
  describe('createTemplate', () => {
    it('inserts with generated id and defaults, then fetches the created template', async () => {
      // First call: INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // Second call: getTemplateById (SELECT)
      mockQuery.mockResolvedValueOnce({ rows: [{ ...rawRow, id: 'test-id-123' }] })

      const result = await createTemplate({
        name: 'Bug Report',
        description: 'Template for bugs',
        default_priority: 'HIGH',
        default_tags: ['bug', 'critical'],
      })

      expect(mockQuery).toHaveBeenCalledTimes(2)

      // Verify INSERT call
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('INSERT INTO task_templates')

      const params = mockQuery.mock.calls[0][1]
      expect(params[0]).toBe('test-id-123') // generated id
      expect(params[1]).toBe('Bug Report')
      expect(params[2]).toBe('Template for bugs')
      expect(params[3]).toBe('INBOX') // default_status defaults to INBOX
      expect(params[4]).toBe('HIGH')
      expect(params[5]).toBeNull() // default_project
      expect(params[6]).toBeNull() // default_assigned_to
      expect(params[7]).toEqual(['bug', 'critical'])

      expect(result.id).toBe('test-id-123')
    })

    it('uses default values for omitted optional fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [{ ...rawRow, id: 'test-id-123' }] })

      await createTemplate({ name: 'Minimal Template' })

      const params = mockQuery.mock.calls[0][1]
      expect(params[2]).toBeNull() // description
      expect(params[3]).toBe('INBOX') // default_status
      expect(params[4]).toBe('MEDIUM') // default_priority
      expect(params[5]).toBeNull() // default_project
      expect(params[6]).toBeNull() // default_assigned_to
      expect(params[7]).toEqual([]) // default_tags
    })
  })

  // ---------------------------------------------------------------
  // updateTemplate
  // ---------------------------------------------------------------
  describe('updateTemplate', () => {
    it('updates allowed fields and returns the updated template', async () => {
      // First: getTemplateById to check existence
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })
      // Second: UPDATE query
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // Third: getTemplateById to return result
      mockQuery.mockResolvedValueOnce({ rows: [{ ...rawRow, name: 'Updated Name' }] })

      const result = await updateTemplate('tpl-1', { name: 'Updated Name' })

      expect(mockQuery).toHaveBeenCalledTimes(3)

      // Verify UPDATE call
      const sql: string = mockQuery.mock.calls[1][0]
      expect(sql).toContain('UPDATE task_templates SET')
      expect(sql).toContain('name = $1')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Updated Name')
    })

    it('returns null when template does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }) // not found

      const result = await updateTemplate('nonexistent', { name: 'New Name' })

      expect(result).toBeNull()
      expect(mockQuery).toHaveBeenCalledTimes(1) // only the existence check
    })

    it('skips UPDATE when no allowed fields are provided', async () => {
      // First: getTemplateById
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })
      // Second: getTemplateById for return (no UPDATE issued)
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })

      const result = await updateTemplate('tpl-1', {})

      // Only 2 queries: existence check + final fetch (no UPDATE)
      expect(mockQuery).toHaveBeenCalledTimes(2)
      expect(result).not.toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // deleteTemplate
  // ---------------------------------------------------------------
  describe('deleteTemplate', () => {
    it('returns true when a row was deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await deleteTemplate('tpl-1')

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM task_templates WHERE id = $1', ['tpl-1'])
      expect(result).toBe(true)
    })

    it('returns false when no row was deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await deleteTemplate('nonexistent')

      expect(result).toBe(false)
    })

    it('returns false when rowCount is null', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: null })

      const result = await deleteTemplate('tpl-1')

      expect(result).toBe(false)
    })
  })

  describe('workspace scope', () => {
    it('lists the templates of a workspace plus the shared ones', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getAllTemplates('ws-a')

      const [sql, params] = mockQuery.mock.calls[0]
      expect(sql).toContain('workspace_id = $1 OR workspace_id IS NULL OR is_default = TRUE')
      expect(params).toEqual(['ws-a'])
    })

    it('stores the workspace of a new template', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1' }] })

      await createTemplate({ name: 'Mine', workspace_id: 'ws-a' })

      expect(mockQuery.mock.calls[0][1].at(-1)).toBe('ws-a')
    })
  })
})
