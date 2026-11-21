import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()
const mockClientQuery = vi.fn()
const mockRelease = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
    connect: vi.fn(() => ({
      query: mockClientQuery,
      release: mockRelease,
    })),
  },
  generateId: vi.fn(() => 'test-id-123'),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import {
  getRepositoriesForProject,
  getRepositoryById,
  getPrimaryRepository,
  createRepository,
  updateRepository,
  deleteRepository,
} from '@taia/core/db/repositories/repository.repository'

describe('repository.repository', () => {
  // ---------------------------------------------------------------
  // getRepositoriesForProject
  // ---------------------------------------------------------------
  describe('getRepositoriesForProject', () => {
    it('returns repositories for project ordered by is_primary DESC, name ASC', async () => {
      const rows = [
        {
          id: 'repo-1',
          project_id: 'proj-1',
          name: 'main-repo',
          url: 'https://github.com/main',
          is_primary: true,
        },
        {
          id: 'repo-2',
          project_id: 'proj-1',
          name: 'docs',
          url: 'https://github.com/docs',
          is_primary: false,
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getRepositoriesForProject('proj-1')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM repositories WHERE project_id = $1 ORDER BY is_primary DESC, name ASC',
        ['proj-1'],
      )
      expect(result).toHaveLength(2)
      expect(result[0].is_primary).toBe(true)
      expect(result[1].is_primary).toBe(false)
    })

    it('normalizes is_primary to boolean', async () => {
      const rows = [
        {
          id: 'repo-1',
          project_id: 'proj-1',
          name: 'repo',
          url: 'https://example.com',
          is_primary: 1,
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getRepositoriesForProject('proj-1')

      expect(result[0].is_primary).toBe(true)
    })

    it('returns empty array when no repositories exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getRepositoriesForProject('proj-empty')
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getRepositoryById
  // ---------------------------------------------------------------
  describe('getRepositoryById', () => {
    it('returns normalized repository when found', async () => {
      const row = {
        id: 'repo-1',
        project_id: 'proj-1',
        name: 'main',
        url: 'https://github.com/main',
        is_primary: true,
      }
      mockQuery.mockResolvedValueOnce({ rows: [row] })

      const result = await getRepositoryById('repo-1')

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM repositories WHERE id = $1', ['repo-1'])
      expect(result).toBeDefined()
      expect(result!.is_primary).toBe(true)
    })

    it('returns undefined when repository not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getRepositoryById('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // getPrimaryRepository
  // ---------------------------------------------------------------
  describe('getPrimaryRepository', () => {
    it('returns the primary repository for a project', async () => {
      const row = {
        id: 'repo-1',
        project_id: 'proj-1',
        name: 'main',
        url: 'https://github.com/main',
        is_primary: true,
      }
      mockQuery.mockResolvedValueOnce({ rows: [row] })

      const result = await getPrimaryRepository('proj-1')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM repositories WHERE project_id = $1 AND is_primary = TRUE LIMIT 1',
        ['proj-1'],
      )
      expect(result).toBeDefined()
      expect(result!.is_primary).toBe(true)
    })

    it('returns undefined when no primary repository exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getPrimaryRepository('proj-empty')
      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // createRepository
  // ---------------------------------------------------------------
  describe('createRepository', () => {
    it('creates repository in transaction and returns it', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] })
      // getRepositoryById for return
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'test-id-123',
            project_id: 'proj-1',
            name: 'new-repo',
            url: 'https://github.com/new',
            is_primary: false,
          },
        ],
      })

      const result = await createRepository({
        project_id: 'proj-1',
        name: 'new-repo',
        url: 'https://github.com/new',
      })

      // Transaction: BEGIN, INSERT, COMMIT
      expect(mockClientQuery).toHaveBeenCalledTimes(3)
      expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN')

      const insertSql: string = mockClientQuery.mock.calls[1][0]
      expect(insertSql).toContain('INSERT INTO repositories')
      const params = mockClientQuery.mock.calls[1][1]
      expect(params[0]).toBe('test-id-123')
      expect(params[1]).toBe('proj-1')
      expect(params[2]).toBe('new-repo')
      expect(params[3]).toBe('https://github.com/new')
      expect(params[4]).toBe(false) // is_primary defaults to false

      expect(mockClientQuery.mock.calls[2][0]).toBe('COMMIT')
      expect(mockRelease).toHaveBeenCalledOnce()
      expect(result.id).toBe('test-id-123')
    })

    it('unsets existing primary before setting new primary', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] })
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'test-id-123',
            project_id: 'proj-1',
            name: 'primary',
            url: 'https://github.com/primary',
            is_primary: true,
          },
        ],
      })

      await createRepository({
        project_id: 'proj-1',
        name: 'primary',
        url: 'https://github.com/primary',
        is_primary: true,
      })

      // BEGIN, UPDATE (unset primary), INSERT, COMMIT
      expect(mockClientQuery).toHaveBeenCalledTimes(4)
      const unsetSql: string = mockClientQuery.mock.calls[1][0]
      expect(unsetSql).toContain('UPDATE repositories SET is_primary = FALSE')
      expect(mockClientQuery.mock.calls[1][1]).toEqual(['proj-1'])

      const insertParams = mockClientQuery.mock.calls[2][1]
      expect(insertParams[4]).toBe(true)
    })

    it('rolls back on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error'))

      await expect(
        createRepository({ project_id: 'proj-1', name: 'fail', url: 'https://fail.com' }),
      ).rejects.toThrow('DB error')

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK')
      expect(mockRelease).toHaveBeenCalledOnce()
    })
  })

  // ---------------------------------------------------------------
  // updateRepository
  // ---------------------------------------------------------------
  describe('updateRepository', () => {
    it('returns null when repository not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await updateRepository('nonexistent', { name: 'Updated' })
      expect(result).toBeNull()
    })

    it('updates allowed fields in transaction and returns updated repo', async () => {
      const repoRow = {
        id: 'repo-1',
        project_id: 'proj-1',
        name: 'old',
        url: 'https://old.com',
        is_primary: false,
      }
      // getRepositoryById (check)
      mockQuery.mockResolvedValueOnce({ rows: [repoRow] })
      // Transaction
      mockClientQuery.mockResolvedValue({ rows: [] })
      // getRepositoryById (return)
      mockQuery.mockResolvedValueOnce({ rows: [{ ...repoRow, name: 'new' }] })

      const result = await updateRepository('repo-1', { name: 'new' })

      expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN')
      const updateSql: string = mockClientQuery.mock.calls[1][0]
      expect(updateSql).toContain('UPDATE repositories SET')
      expect(updateSql).toContain('name = $1')
      expect(result).toBeDefined()
      expect(result!.name).toBe('new')
    })

    it('unsets existing primary when setting is_primary to true', async () => {
      const repoRow = {
        id: 'repo-1',
        project_id: 'proj-1',
        name: 'repo',
        url: 'https://repo.com',
        is_primary: false,
      }
      mockQuery.mockResolvedValueOnce({ rows: [repoRow] })
      mockClientQuery.mockResolvedValue({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [{ ...repoRow, is_primary: true }] })

      await updateRepository('repo-1', { is_primary: true })

      // Transaction should include unset primary query
      const unsetCall = mockClientQuery.mock.calls.find(
        (call: any[]) =>
          typeof call[0] === 'string' &&
          call[0].includes('UPDATE repositories SET is_primary = FALSE'),
      )
      expect(unsetCall).toBeDefined()
      expect(unsetCall![1]).toEqual(['proj-1', 'repo-1'])
    })

    it('rolls back on error during update', async () => {
      const repoRow = {
        id: 'repo-1',
        project_id: 'proj-1',
        name: 'repo',
        url: 'https://repo.com',
        is_primary: false,
      }
      mockQuery.mockResolvedValueOnce({ rows: [repoRow] })
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error'))

      await expect(updateRepository('repo-1', { name: 'fail' })).rejects.toThrow('DB error')

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK')
      expect(mockRelease).toHaveBeenCalledOnce()
    })
  })

  // ---------------------------------------------------------------
  // deleteRepository
  // ---------------------------------------------------------------
  describe('deleteRepository', () => {
    it('returns true when repository is deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await deleteRepository('repo-1')

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM repositories WHERE id = $1', ['repo-1'])
      expect(result).toBe(true)
    })

    it('returns false when repository not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await deleteRepository('nonexistent')
      expect(result).toBe(false)
    })
  })
})
