import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListTasks = vi.fn()
const mockGetTask = vi.fn()
const mockCreateTaskWithBroadcast = vi.fn()
const mockUpdateTaskWithBroadcast = vi.fn()
const mockMoveTaskWithBroadcast = vi.fn()
const mockAssignTaskWithBroadcast = vi.fn()
const mockDeleteTaskWithBroadcast = vi.fn()
const mockGetAgentById = vi.fn()

vi.mock('@taia/core/services/task.service', () => ({
  listTasks: (...args: any[]) => mockListTasks(...args),
  getTask: (...args: any[]) => mockGetTask(...args),
  createTaskWithBroadcast: (...args: any[]) => mockCreateTaskWithBroadcast(...args),
  updateTaskWithBroadcast: (...args: any[]) => mockUpdateTaskWithBroadcast(...args),
  moveTaskWithBroadcast: (...args: any[]) => mockMoveTaskWithBroadcast(...args),
  assignTaskWithBroadcast: (...args: any[]) => mockAssignTaskWithBroadcast(...args),
  deleteTaskWithBroadcast: (...args: any[]) => mockDeleteTaskWithBroadcast(...args),
}))

vi.mock('@taia/core/db', () => ({
  getAgentById: (...args: any[]) => mockGetAgentById(...args),
}))

import {
  listTasksTool,
  getTaskTool,
  createTaskTool,
  updateTaskTool,
  moveTaskTool,
  assignTaskTool,
  searchTasksTool,
  deleteTaskTool,
  taskTools,
} from '../../src/tools/task-tools'

const SAMPLE_TASK = {
  id: 'task-1',
  title: 'Implement auth',
  status: 'in-progress',
  priority: 'HIGH',
  assigned_to: 'agent-1',
  project: 'taia',
  tags: ['backend'],
  description: 'Add JWT authentication to the API',
}

const SAMPLE_TASK_2 = {
  id: 'task-2',
  title: 'Fix login bug',
  status: 'inbox',
  priority: 'URGENT',
  assigned_to: null,
  project: 'taia',
  tags: ['bug'],
  description: 'Login fails on Safari',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listTasksTool', () => {
  it('has correct name and description', () => {
    expect(listTasksTool.name).toBe('taia_list_tasks')
    expect(listTasksTool.description).toBeTruthy()
  })

  it('returns mapped tasks with total', async () => {
    mockListTasks.mockResolvedValue({ tasks: [SAMPLE_TASK, SAMPLE_TASK_2], total: 2 })

    const result = await listTasksTool.handler({})

    expect(result).toEqual({
      tasks: [
        {
          id: 'task-1',
          title: 'Implement auth',
          status: 'in-progress',
          priority: 'HIGH',
          assigned_to: 'agent-1',
          project: 'taia',
          tags: ['backend'],
        },
        {
          id: 'task-2',
          title: 'Fix login bug',
          status: 'inbox',
          priority: 'URGENT',
          assigned_to: null,
          project: 'taia',
          tags: ['bug'],
        },
      ],
      total: 2,
    })
  })

  it('passes workspace_id filter', async () => {
    mockListTasks.mockResolvedValue({ tasks: [], total: 0 })

    await listTasksTool.handler({ workspace_id: 'ws-sales' })

    expect(mockListTasks).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: 'ws-sales' }),
    )
  })
})

describe('getTaskTool', () => {
  it('has correct name and description', () => {
    expect(getTaskTool.name).toBe('taia_get_task')
    expect(getTaskTool.description).toBeTruthy()
  })

  it('returns task by ID', async () => {
    mockGetTask.mockResolvedValue(SAMPLE_TASK)

    const result = await getTaskTool.handler({ taskId: 'task-1' })

    expect(result).toEqual(SAMPLE_TASK)
    expect(mockGetTask).toHaveBeenCalledWith('task-1')
  })

  it('throws for missing task', async () => {
    mockGetTask.mockResolvedValue(null)

    await expect(getTaskTool.handler({ taskId: 'task-999' })).rejects.toThrow(
      'Task task-999 not found',
    )
  })
})

describe('createTaskTool', () => {
  it('has correct name and description', () => {
    expect(createTaskTool.name).toBe('taia_create_task')
    expect(createTaskTool.description).toBeTruthy()
  })

  it('creates with workspace_id and returns created', async () => {
    const created = { ...SAMPLE_TASK, workspace_id: 'ws-sales' }
    mockCreateTaskWithBroadcast.mockResolvedValue(created)

    const result = await createTaskTool.handler({
      title: 'Implement auth',
      priority: 'HIGH',
      workspace_id: 'ws-sales',
    })

    expect(result).toEqual({ created: true, task: created })
    expect(mockCreateTaskWithBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Implement auth',
        workspace_id: 'ws-sales',
        created_by: 'mcp',
      }),
    )
  })
})

describe('updateTaskTool', () => {
  it('has correct name and description', () => {
    expect(updateTaskTool.name).toBe('taia_update_task')
    expect(updateTaskTool.description).toBeTruthy()
  })

  it('updates and returns task', async () => {
    const updated = { ...SAMPLE_TASK, title: 'Updated title' }
    mockUpdateTaskWithBroadcast.mockResolvedValue(updated)

    const result = await updateTaskTool.handler({ taskId: 'task-1', title: 'Updated title' })

    expect(result).toEqual({ updated: true, task: updated })
    expect(mockUpdateTaskWithBroadcast).toHaveBeenCalledWith(
      'task-1',
      { title: 'Updated title' },
      'mcp',
    )
  })

  it('throws if task not found', async () => {
    mockUpdateTaskWithBroadcast.mockResolvedValue(null)

    await expect(updateTaskTool.handler({ taskId: 'task-999', title: 'x' })).rejects.toThrow(
      'Task task-999 not found',
    )
  })
})

describe('moveTaskTool', () => {
  it('has correct name and description', () => {
    expect(moveTaskTool.name).toBe('taia_move_task')
    expect(moveTaskTool.description).toBeTruthy()
  })

  it('moves and returns task', async () => {
    const moved = { id: 'task-1', title: 'Implement auth', status: 'done' }
    mockMoveTaskWithBroadcast.mockResolvedValue(moved)

    const result = await moveTaskTool.handler({ taskId: 'task-1', status: 'done' })

    expect(result).toEqual({
      moved: true,
      task: { id: 'task-1', title: 'Implement auth', status: 'done' },
    })
    expect(mockMoveTaskWithBroadcast).toHaveBeenCalledWith('task-1', 'done', 'mcp')
  })

  it('throws if task not found', async () => {
    mockMoveTaskWithBroadcast.mockResolvedValue(null)

    await expect(moveTaskTool.handler({ taskId: 'task-999', status: 'done' })).rejects.toThrow(
      'Task task-999 not found',
    )
  })
})

describe('assignTaskTool', () => {
  it('has correct name and description', () => {
    expect(assignTaskTool.name).toBe('taia_assign_task')
    expect(assignTaskTool.description).toBeTruthy()
  })

  it('assigns task to agent', async () => {
    mockGetAgentById.mockResolvedValue({ id: 'agent-1', name: 'Coder' })
    const assigned = {
      id: 'task-1',
      title: 'Implement auth',
      assigned_to: 'agent-1',
      status: 'in-progress',
    }
    mockAssignTaskWithBroadcast.mockResolvedValue(assigned)

    const result = await assignTaskTool.handler({ taskId: 'task-1', agentId: 'agent-1' })

    expect(result).toEqual({
      assigned: true,
      task: {
        id: 'task-1',
        title: 'Implement auth',
        assigned_to: 'agent-1',
        status: 'in-progress',
      },
    })
  })

  it('throws if agent not found', async () => {
    mockGetAgentById.mockResolvedValue(null)

    await expect(
      assignTaskTool.handler({ taskId: 'task-1', agentId: 'agent-999' }),
    ).rejects.toThrow('Agent agent-999 not found')
  })

  it('throws if task not found', async () => {
    mockGetAgentById.mockResolvedValue({ id: 'agent-1', name: 'Coder' })
    mockAssignTaskWithBroadcast.mockResolvedValue(null)

    await expect(
      assignTaskTool.handler({ taskId: 'task-999', agentId: 'agent-1' }),
    ).rejects.toThrow('Task task-999 not found')
  })
})

describe('searchTasksTool', () => {
  it('has correct name and description', () => {
    expect(searchTasksTool.name).toBe('taia_search_tasks')
    expect(searchTasksTool.description).toBeTruthy()
  })

  it('searches with query', async () => {
    mockListTasks.mockResolvedValue({ tasks: [SAMPLE_TASK], total: 1 })

    const result = await searchTasksTool.handler({ query: 'auth' })

    expect(result).toEqual({
      results: [
        {
          id: 'task-1',
          title: 'Implement auth',
          status: 'in-progress',
          priority: 'HIGH',
          assigned_to: 'agent-1',
          description: 'Add JWT authentication to the API',
        },
      ],
      total: 1,
    })
    expect(mockListTasks).toHaveBeenCalledWith({ q: 'auth', status: undefined })
  })
})

describe('deleteTaskTool', () => {
  it('has correct name and description', () => {
    expect(deleteTaskTool.name).toBe('taia_delete_task')
    expect(deleteTaskTool.description).toBeTruthy()
  })

  it('deletes an existing task', async () => {
    mockGetTask.mockResolvedValue(SAMPLE_TASK)
    mockDeleteTaskWithBroadcast.mockResolvedValue(undefined)

    const result = await deleteTaskTool.handler({ taskId: 'task-1' })

    expect(result).toEqual({ deleted: true, taskId: 'task-1' })
    expect(mockDeleteTaskWithBroadcast).toHaveBeenCalledWith('task-1', 'mcp')
  })

  it('throws if task not found', async () => {
    mockGetTask.mockResolvedValue(null)

    await expect(deleteTaskTool.handler({ taskId: 'task-999' })).rejects.toThrow(
      'Task task-999 not found',
    )
    expect(mockDeleteTaskWithBroadcast).not.toHaveBeenCalled()
  })
})

describe('taskTools array', () => {
  it('has 8 items', () => {
    expect(taskTools).toHaveLength(8)
  })
})
