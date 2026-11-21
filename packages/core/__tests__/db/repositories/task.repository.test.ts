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
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  assignTask,
  moveTask,
} from '@taia/core/db/repositories/task.repository'

describe('task.repository', () => {
  // ---------------------------------------------------------------
  // getAllTasks
  // ---------------------------------------------------------------
  describe('getAllTasks', () => {
    it('returns all tasks ordered by status priority', async () => {
      const rows = [
        { id: 'task-1', title: 'Task 1', status: 'IN_PROGRESS', tags: ['bug'] },
        { id: 'task-2', title: 'Task 2', status: 'INBOX', tags: null },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getAllTasks()

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('FROM tasks t')
      expect(sql).toContain('ORDER BY')
      expect(result).toHaveLength(2)
      expect(result[0].tags).toEqual(['bug'])
      expect(result[1].tags).toEqual([])
    })

    it('applies archive filter when archiveBefore is provided', async () => {
      const archiveBefore = new Date('2025-01-01T00:00:00Z')
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getAllTasks({ archiveBefore })

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('WHERE')
      expect(sql).toContain('bc.is_done_state = FALSE')
      expect(mockQuery.mock.calls[0][1]).toEqual([archiveBefore.toISOString()])
    })

    it('returns empty array when no tasks exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getAllTasks()
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getTaskById
  // ---------------------------------------------------------------
  describe('getTaskById', () => {
    it('returns task with tags when found', async () => {
      const taskRow = { id: 'task-1', title: 'My Task', status: 'INBOX' }
      mockQuery
        .mockResolvedValueOnce({ rows: [taskRow] }) // task query
        .mockResolvedValueOnce({ rows: [{ tag: 'bug' }, { tag: 'urgent' }] }) // tags query

      const result = await getTaskById('task-1')

      expect(mockQuery).toHaveBeenCalledTimes(2)
      expect(mockQuery.mock.calls[0][0]).toContain('FROM tasks t WHERE t.id = $1')
      expect(mockQuery.mock.calls[0][1]).toEqual(['task-1'])
      expect(mockQuery.mock.calls[1][0]).toContain('FROM task_tags WHERE task_id = $1')
      expect(result).toEqual({ ...taskRow, tags: ['bug', 'urgent'] })
    })

    it('returns undefined when task not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getTaskById('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // createTask
  // ---------------------------------------------------------------
  describe('createTask', () => {
    it('creates a task with default values and returns it', async () => {
      // createTask uses client (transaction), then calls getTaskById at the end
      const createdRow = { id: 'test-id-123', title: 'New Task', status: 'INBOX', tags: [] }
      mockClientQuery.mockResolvedValue({ rows: [] })
      // getTaskById after creation: task query + tags query
      mockQuery
        .mockResolvedValueOnce({ rows: [createdRow] }) // getTaskById -> task
        .mockResolvedValueOnce({ rows: [] }) // getTaskById -> tags

      const result = await createTask({ title: 'New Task' })

      // Transaction: BEGIN, INSERT, COMMIT
      expect(mockClientQuery).toHaveBeenCalledTimes(3)
      const insertSql: string = mockClientQuery.mock.calls[1][0]
      expect(insertSql).toContain('INSERT INTO tasks')

      // Default status = INBOX, priority = MEDIUM, confidence = needs-approval
      const params = mockClientQuery.mock.calls[1][1]
      expect(params[0]).toBe('test-id-123')
      expect(params[1]).toBe('New Task')
      expect(params[3]).toBe('INBOX')
      expect(params[4]).toBe('MEDIUM')
      expect(params[5]).toBe('needs-approval')

      expect(mockRelease).toHaveBeenCalledOnce()
      expect(result).toEqual({ ...createdRow, tags: [] })
    })

    it('defaults to ASSIGNED status when assigned_to is provided', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] })
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'test-id-123', title: 'Task', status: 'ASSIGNED' }] })
        .mockResolvedValueOnce({ rows: [] })

      await createTask({ title: 'Task', assigned_to: 'agent-a' })

      const params = mockClientQuery.mock.calls[1][1]
      expect(params[3]).toBe('ASSIGNED')
      expect(params[10]).toBe('agent-a')
    })

    it('inserts tags in transaction when provided', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] })
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'test-id-123', title: 'Task' }] })
        .mockResolvedValueOnce({ rows: [{ tag: 'bug' }, { tag: 'frontend' }] })

      await createTask({ title: 'Task', tags: ['bug', 'frontend'] })

      // BEGIN, INSERT task, INSERT tag 1, INSERT tag 2, COMMIT = 5 calls
      expect(mockClientQuery).toHaveBeenCalledTimes(5)
      expect(mockClientQuery.mock.calls[2][0]).toContain('INSERT INTO task_tags')
      expect(mockClientQuery.mock.calls[2][1]).toEqual(['test-id-123', 'bug'])
      expect(mockClientQuery.mock.calls[3][1]).toEqual(['test-id-123', 'frontend'])
    })

    it('rolls back on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error')) // INSERT fails

      await expect(createTask({ title: 'Fail' })).rejects.toThrow('DB error')
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK')
      expect(mockRelease).toHaveBeenCalledOnce()
    })
  })

  // ---------------------------------------------------------------
  // updateTask
  // ---------------------------------------------------------------
  describe('updateTask', () => {
    it('returns null when task not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }) // getTaskById returns undefined

      const result = await updateTask('nonexistent', { title: 'Updated' })
      expect(result).toBeNull()
    })

    it('updates allowed fields and returns updated task', async () => {
      const taskRow = { id: 'task-1', title: 'Old', status: 'INBOX' }
      // getTaskById (first call)
      mockQuery
        .mockResolvedValueOnce({ rows: [taskRow] }) // initial getTaskById -> task
        .mockResolvedValueOnce({ rows: [] }) // initial getTaskById -> tags
        .mockResolvedValueOnce({ rows: [] }) // UPDATE query
        .mockResolvedValueOnce({ rows: [{ ...taskRow, title: 'New' }] }) // final getTaskById -> task
        .mockResolvedValueOnce({ rows: [] }) // final getTaskById -> tags

      const result = await updateTask('task-1', { title: 'New' })

      // Verify UPDATE was called with correct params
      const updateCall = mockQuery.mock.calls[2]
      expect(updateCall[0]).toContain('UPDATE tasks SET')
      expect(updateCall[0]).toContain('title = $1')
      expect(updateCall[1]).toEqual(['New', 'task-1'])
      expect(result).toBeDefined()
    })

    it('auto-transitions from INBOX to ASSIGNED when assigned_to is set', async () => {
      const taskRow = { id: 'task-1', title: 'Task', status: 'INBOX' }
      mockQuery
        .mockResolvedValueOnce({ rows: [taskRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ ...taskRow, status: 'ASSIGNED', assigned_to: 'agent-a' }],
        })
        .mockResolvedValueOnce({ rows: [] })

      await updateTask('task-1', { assigned_to: 'agent-a' })

      const updateSql: string = mockQuery.mock.calls[2][0]
      expect(updateSql).toContain('status')
      expect(updateSql).toContain('assigned_to')
    })

    it('replaces tags when tags are provided', async () => {
      const taskRow = { id: 'task-1', title: 'Task', status: 'INBOX' }
      mockQuery
        .mockResolvedValueOnce({ rows: [taskRow] })
        .mockResolvedValueOnce({ rows: [{ tag: 'old' }] })
        .mockResolvedValueOnce({ rows: [] }) // DELETE old tags
        .mockResolvedValueOnce({ rows: [] }) // INSERT new tag
        .mockResolvedValueOnce({ rows: [taskRow] })
        .mockResolvedValueOnce({ rows: [{ tag: 'new' }] })

      await updateTask('task-1', { tags: ['new'] })

      // DELETE old tags
      expect(mockQuery.mock.calls[2][0]).toContain('DELETE FROM task_tags WHERE task_id = $1')
      // INSERT new tag
      expect(mockQuery.mock.calls[3][0]).toContain('INSERT INTO task_tags')
      expect(mockQuery.mock.calls[3][1]).toEqual(['task-1', 'new'])
    })
  })

  // ---------------------------------------------------------------
  // deleteTask
  // ---------------------------------------------------------------
  describe('deleteTask', () => {
    it('deletes task and related data in transaction', async () => {
      const taskRow = { id: 'task-1', title: 'Task' }
      // getTaskById
      mockQuery.mockResolvedValueOnce({ rows: [taskRow] }).mockResolvedValueOnce({ rows: [] })
      // Transaction client queries
      mockClientQuery.mockResolvedValue({ rows: [] })

      const result = await deleteTask('task-1')

      expect(result).toBe(true)
      // BEGIN + DELETE task_tags + DELETE message_mentions + DELETE messages + DELETE subtasks + DELETE tasks + COMMIT
      expect(mockClientQuery).toHaveBeenCalledTimes(7)
      expect(mockClientQuery.mock.calls[1][0]).toContain('DELETE FROM task_tags')
      expect(mockClientQuery.mock.calls[5][0]).toContain('DELETE FROM tasks')
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('returns false when task not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await deleteTask('nonexistent')
      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // assignTask
  // ---------------------------------------------------------------
  describe('assignTask', () => {
    it('assigns agent and sets status to ASSIGNED', async () => {
      const taskRow = { id: 'task-1', title: 'Task', status: 'INBOX' }
      // getTaskById (first)
      mockQuery.mockResolvedValueOnce({ rows: [taskRow] }).mockResolvedValueOnce({ rows: [] })
      // Transaction
      mockClientQuery.mockResolvedValue({ rows: [] })
      // getTaskById (after)
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ ...taskRow, status: 'ASSIGNED', assigned_to: 'agent-a' }],
        })
        .mockResolvedValueOnce({ rows: [] })

      const result = await assignTask('task-1', 'agent-a', 'sess-key')

      expect(mockClientQuery.mock.calls[1][0]).toContain('UPDATE tasks SET assigned_to = $1')
      expect(mockClientQuery.mock.calls[1][0]).toContain("status = 'ASSIGNED'")
      expect(mockClientQuery.mock.calls[1][1]).toEqual(['agent-a', 'sess-key', 'task-1'])
      expect(result).toBeDefined()
      expect(result!.assigned_to).toBe('agent-a')
    })

    it('returns null when task not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await assignTask('nonexistent', 'agent-a')
      expect(result).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // moveTask
  // ---------------------------------------------------------------
  describe('moveTask', () => {
    it('moves task to new status and returns old status', async () => {
      const taskRow = { id: 'task-1', title: 'Task', status: 'INBOX' }
      // getTaskById (first)
      mockQuery.mockResolvedValueOnce({ rows: [taskRow] }).mockResolvedValueOnce({ rows: [] })
      // Transaction
      mockClientQuery.mockResolvedValue({ rows: [] })
      // getTaskById (after)
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...taskRow, status: 'IN_PROGRESS' }] })
        .mockResolvedValueOnce({ rows: [] })

      const result = await moveTask('task-1', 'IN_PROGRESS')

      expect(result).toBeDefined()
      expect(result!.oldStatus).toBe('INBOX')
      expect(result!.task.status).toBe('IN_PROGRESS')
    })

    it('sets completed_at when moving to DONE', async () => {
      const taskRow = { id: 'task-1', title: 'Task', status: 'IN_PROGRESS' }
      mockQuery.mockResolvedValueOnce({ rows: [taskRow] }).mockResolvedValueOnce({ rows: [] })
      mockClientQuery.mockResolvedValue({ rows: [] })
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...taskRow, status: 'DONE' }] })
        .mockResolvedValueOnce({ rows: [] })

      await moveTask('task-1', 'DONE')

      // The UPDATE should set completed_at = NOW()
      const updateSql: string = mockClientQuery.mock.calls[1][0]
      expect(updateSql).toContain('completed_at = NOW()')
    })

    it('clears completed_at when moving away from DONE', async () => {
      const taskRow = { id: 'task-1', title: 'Task', status: 'DONE' }
      mockQuery.mockResolvedValueOnce({ rows: [taskRow] }).mockResolvedValueOnce({ rows: [] })
      mockClientQuery.mockResolvedValue({ rows: [] })
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...taskRow, status: 'IN_PROGRESS' }] })
        .mockResolvedValueOnce({ rows: [] })

      await moveTask('task-1', 'IN_PROGRESS')

      const updateSql: string = mockClientQuery.mock.calls[1][0]
      expect(updateSql).toContain('completed_at = NULL')
    })

    it('returns null when task not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await moveTask('nonexistent', 'DONE')
      expect(result).toBeNull()
    })
  })
})
