import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetSubtasksForTask = vi.fn()
const mockCreateSubtask = vi.fn()
const mockUpdateSubtask = vi.fn()

vi.mock('@taia/core/db', () => ({
  getSubtasksForTask: (...args: any[]) => mockGetSubtasksForTask(...args),
  createSubtask: (...args: any[]) => mockCreateSubtask(...args),
  updateSubtask: (...args: any[]) => mockUpdateSubtask(...args),
}))

import {
  listSubtasksTool,
  createSubtaskTool,
  updateSubtaskTool,
  subtaskTools,
} from '../../src/tools/subtask-tools'

const SAMPLE_SUBTASKS = [
  { id: 'sub-1', title: 'Write migration SQL', completed: true, position: 0 },
  { id: 'sub-2', title: 'Update repository layer', completed: false, position: 1 },
  { id: 'sub-3', title: 'Add integration tests', completed: false, position: 2 },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listSubtasksTool', () => {
  it('has correct name and description', () => {
    expect(listSubtasksTool.name).toBe('taia_list_subtasks')
    expect(listSubtasksTool.description).toBeTruthy()
  })

  it('returns subtasks', async () => {
    mockGetSubtasksForTask.mockResolvedValue(SAMPLE_SUBTASKS)

    const result = await listSubtasksTool.handler({ taskId: 'task-1' })

    expect(result).toEqual({
      subtasks: [
        { id: 'sub-1', title: 'Write migration SQL', completed: true, position: 0 },
        { id: 'sub-2', title: 'Update repository layer', completed: false, position: 1 },
        { id: 'sub-3', title: 'Add integration tests', completed: false, position: 2 },
      ],
    })
    expect(mockGetSubtasksForTask).toHaveBeenCalledWith('task-1')
  })
})

describe('createSubtaskTool', () => {
  it('has correct name and description', () => {
    expect(createSubtaskTool.name).toBe('taia_create_subtask')
    expect(createSubtaskTool.description).toBeTruthy()
  })

  it('creates and returns subtask', async () => {
    const created = {
      id: 'sub-4',
      task_id: 'task-1',
      title: 'Write docs',
      completed: false,
      position: 3,
    }
    mockCreateSubtask.mockResolvedValue(created)

    const result = await createSubtaskTool.handler({ task_id: 'task-1', title: 'Write docs' })

    expect(result).toEqual({ created: true, subtask: created })
    expect(mockCreateSubtask).toHaveBeenCalledWith({ task_id: 'task-1', title: 'Write docs' })
  })
})

describe('updateSubtaskTool', () => {
  it('has correct name and description', () => {
    expect(updateSubtaskTool.name).toBe('taia_update_subtask')
    expect(updateSubtaskTool.description).toBeTruthy()
  })

  it('updates subtask', async () => {
    const updated = { id: 'sub-2', title: 'Update repository layer', completed: true, position: 1 }
    mockUpdateSubtask.mockResolvedValue(updated)

    const result = await updateSubtaskTool.handler({ subtaskId: 'sub-2', completed: true })

    expect(result).toEqual({ updated: true, subtask: updated })
    expect(mockUpdateSubtask).toHaveBeenCalledWith('sub-2', { completed: true })
  })

  it('throws when subtask not found', async () => {
    mockUpdateSubtask.mockResolvedValue(null)

    await expect(
      updateSubtaskTool.handler({ subtaskId: 'sub-999', completed: true }),
    ).rejects.toThrow('Subtask sub-999 not found')
  })
})

describe('subtaskTools array', () => {
  it('has 3 items', () => {
    expect(subtaskTools).toHaveLength(3)
  })
})
