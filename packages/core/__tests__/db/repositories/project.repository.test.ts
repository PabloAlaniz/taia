import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  generateId: vi.fn(() => 'test-id-123'),
}))

beforeEach(() => vi.clearAllMocks())

import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} from '@taia/core/db/repositories/project.repository'

describe('project.repository', () => {
  // ---------------------------------------------------------------
  // getAllProjects
  // ---------------------------------------------------------------
  describe('getAllProjects', () => {
    it('returns all projects ordered by name ASC', async () => {
      const rows = [
        { id: 'proj-1', name: 'Alpha', description: 'First' },
        { id: 'proj-2', name: 'Beta', description: null },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getAllProjects()

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM projects ORDER BY name ASC')
      expect(result).toEqual(rows)
    })

    it('returns empty array when no projects exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getAllProjects()
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getProjectById
  // ---------------------------------------------------------------
  describe('getProjectById', () => {
    it('returns project when found', async () => {
      const row = { id: 'proj-1', name: 'Alpha', description: 'First' }
      mockQuery.mockResolvedValueOnce({ rows: [row] })

      const result = await getProjectById('proj-1')

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM projects WHERE id = $1', ['proj-1'])
      expect(result).toEqual(row)
    })

    it('returns undefined when project not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getProjectById('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // createProject
  // ---------------------------------------------------------------
  describe('createProject', () => {
    it('creates project with generated id and returns it', async () => {
      const projectRow = { id: 'test-id-123', name: 'New Project', description: 'Desc' }
      // INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // getProjectById
      mockQuery.mockResolvedValueOnce({ rows: [projectRow] })

      const result = await createProject({ name: 'New Project', description: 'Desc' })

      const insertSql: string = mockQuery.mock.calls[0][0]
      expect(insertSql).toContain('INSERT INTO projects')
      const params = mockQuery.mock.calls[0][1]
      expect(params[0]).toBe('test-id-123')
      expect(params[1]).toBe('New Project')
      expect(params[2]).toBe('Desc')

      expect(result).toEqual(projectRow)
    })

    it('passes null for description when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-id-123', name: 'Minimal', description: null }],
      })

      await createProject({ name: 'Minimal' })

      const params = mockQuery.mock.calls[0][1]
      expect(params[2]).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // updateProject
  // ---------------------------------------------------------------
  describe('updateProject', () => {
    it('returns null when project not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await updateProject('nonexistent', { name: 'Updated' })
      expect(result).toBeNull()
    })

    it('updates allowed fields and returns updated project', async () => {
      const projRow = { id: 'proj-1', name: 'Old', description: null }
      mockQuery
        .mockResolvedValueOnce({ rows: [projRow] }) // getProjectById (check)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ ...projRow, name: 'New', description: 'Updated desc' }] }) // getProjectById (return)

      const result = await updateProject('proj-1', { name: 'New', description: 'Updated desc' })

      const updateSql: string = mockQuery.mock.calls[1][0]
      expect(updateSql).toContain('UPDATE projects SET')
      expect(result).toBeDefined()
      expect(result!.name).toBe('New')
    })

    it('does not issue UPDATE when no valid fields provided', async () => {
      const projRow = { id: 'proj-1', name: 'Project' }
      mockQuery
        .mockResolvedValueOnce({ rows: [projRow] }) // getProjectById (check)
        .mockResolvedValueOnce({ rows: [projRow] }) // getProjectById (return)

      const result = await updateProject('proj-1', {} as any)

      // Only 2 queries: check + final get (no UPDATE)
      expect(mockQuery).toHaveBeenCalledTimes(2)
      expect(result).toBeDefined()
    })
  })

  // ---------------------------------------------------------------
  // deleteProject
  // ---------------------------------------------------------------
  describe('deleteProject', () => {
    it('returns true when project is deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await deleteProject('proj-1')

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM projects WHERE id = $1', ['proj-1'])
      expect(result).toBe(true)
    })

    it('returns false when project not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await deleteProject('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('workspace scope', () => {
    it('lists the projects used in a workspace: home workspace or tasks there', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p1' }] })

      await getAllProjects('ws-a')

      const [sql, params] = mockQuery.mock.calls[0]
      expect(sql).toContain('p.workspace_id = $1')
      expect(sql).toContain('t.workspace_id = $1')
      expect(params).toEqual(['ws-a'])
    })

    it('creates the project with the given home workspace, or none', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'p1' }] })

      await createProject({ name: 'A', workspace_id: 'ws-a' })
      expect(mockQuery.mock.calls[0][1].at(-1)).toBe('ws-a')

      mockQuery.mockClear()
      await createProject({ name: 'B' })
      expect(mockQuery.mock.calls[0][1].at(-1)).toBeNull()
    })
  })
})
