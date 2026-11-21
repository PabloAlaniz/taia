import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listTasks,
  getTask,
  createTaskWithBroadcast,
  updateTaskWithBroadcast,
  moveTaskWithBroadcast,
  deleteTaskWithBroadcast,
  assignTaskWithBroadcast,
} from '@taia/core/services/task.service'

const mockGetAllTasks = vi.fn()
const mockGetTaskById = vi.fn()
const mockCreateTask = vi.fn()
const mockUpdateTask = vi.fn()
const mockDeleteTask = vi.fn()
const mockMoveTask = vi.fn()
const mockAssignTask = vi.fn()
const mockGetAgentById = vi.fn()
const mockEventBusEmit = vi.fn()
const mockGetWorkspaceColumns = vi.fn(async (_workspaceId: string) => [] as Array<{ slug: string }>)

vi.mock('@taia/core/db', () => ({
  getAllTasks: (...args: any[]) => mockGetAllTasks(...args),
  getTaskById: (...args: any[]) => mockGetTaskById(...args),
  createTask: (...args: any[]) => mockCreateTask(...args),
  updateTask: (...args: any[]) => mockUpdateTask(...args),
  deleteTask: (...args: any[]) => mockDeleteTask(...args),
  moveTask: (...args: any[]) => mockMoveTask(...args),
  assignTask: (...args: any[]) => mockAssignTask(...args),
  getAgentById: (...args: any[]) => mockGetAgentById(...args),
  getUnresolvedBlockerCount: vi.fn(() => 0),
  areAllBlockersResolved: vi.fn(() => true),
}))

vi.mock('@taia/core/services/activity.service', () => ({
  computeChanges: vi.fn(() => ({})),
}))

vi.mock('@taia/core/services/workspace.service', () => ({
  isDoneStatus: vi.fn(() => false),
  getWorkspaceColumns: (workspaceId: string) => mockGetWorkspaceColumns(workspaceId),
}))

vi.mock('@taia/core/events/event-bus', () => ({
  eventBus: { emit: (...args: any[]) => mockEventBusEmit(...args), clear: vi.fn() },
}))

const SAMPLE_TASKS = [
  {
    id: '1',
    title: 'Task A',
    status: 'INBOX',
    priority: 'HIGH',
    project: 'demo',
    assigned_to: 'agent-1',
    description: 'A description',
  },
  {
    id: '2',
    title: 'Task B',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    project: 'other',
    assigned_to: 'agent-5',
    description: null,
  },
  {
    id: '3',
    title: 'Task C',
    status: 'DONE',
    priority: 'LOW',
    project: 'demo',
    assigned_to: null,
    description: 'search me',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAllTasks.mockResolvedValue([...SAMPLE_TASKS])
})

describe('listTasks', () => {
  it('returns all tasks when no filters', async () => {
    const { tasks, total } = await listTasks()
    expect(tasks).toHaveLength(3)
    expect(total).toBe(3)
  })

  it('filters by status', async () => {
    const { tasks } = await listTasks({ status: 'inbox' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('1')
  })

  it('filters by status case-insensitive', async () => {
    const { tasks } = await listTasks({ status: 'In_Progress' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('2')
  })

  it('filters by project', async () => {
    const { tasks } = await listTasks({ project: 'demo' })
    expect(tasks).toHaveLength(2)
  })

  it('filters by assigned_to', async () => {
    const { tasks } = await listTasks({ assigned_to: 'agent-1' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('1')
  })

  it('filters by priority', async () => {
    const { tasks } = await listTasks({ priority: 'high' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('1')
  })

  it('filters by search query (title)', async () => {
    const { tasks } = await listTasks({ q: 'Task B' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('2')
  })

  it('filters by search query (description)', async () => {
    const { tasks } = await listTasks({ q: 'search me' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('3')
  })

  it('combines multiple filters', async () => {
    const { tasks } = await listTasks({ status: 'inbox', project: 'demo' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('1')
  })
})

describe('getTask', () => {
  it('delegates to getTaskById', async () => {
    const task = { id: 't1', title: 'Test' }
    mockGetTaskById.mockResolvedValue(task)

    const result = await getTask('t1')
    expect(result).toEqual(task)
    expect(mockGetTaskById).toHaveBeenCalledWith('t1')
  })
})

describe('createTaskWithBroadcast', () => {
  it('creates task and emits event', async () => {
    const created = { id: 'new-1', title: 'New', status: 'INBOX', created_by: 'mcp' }
    mockCreateTask.mockResolvedValue(created)

    const result = await createTaskWithBroadcast({ title: 'New', created_by: 'mcp' })

    expect(result).toEqual(created)
    expect(mockCreateTask).toHaveBeenCalledWith({ title: 'New', created_by: 'mcp' })
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task:created', payload: { task: created } }),
    )
  })

  it('rejects invalid actor', async () => {
    mockGetAgentById.mockResolvedValue(null)
    await expect(
      createTaskWithBroadcast({ title: 'New', created_by: 'invalid-actor' }),
    ).rejects.toThrow('Invalid actor')
  })
})

describe('updateTaskWithBroadcast', () => {
  it('updates task and emits event', async () => {
    const updated = { id: 't1', title: 'Updated' }
    mockUpdateTask.mockResolvedValue(updated)

    const result = await updateTaskWithBroadcast('t1', { title: 'Updated' }, 'web-ui')

    expect(result).toEqual(updated)
    expect(mockEventBusEmit).toHaveBeenCalledWith(expect.objectContaining({ type: 'task:updated' }))
  })

  it('returns null and skips event when task not found', async () => {
    mockUpdateTask.mockResolvedValue(null)

    const result = await updateTaskWithBroadcast('unknown', { title: 'X' }, 'web-ui')

    expect(result).toBeNull()
    expect(mockEventBusEmit).not.toHaveBeenCalled()
  })
})

describe('moveTaskWithBroadcast', () => {
  it('moves task and emits event', async () => {
    const moved = { id: 't1', status: 'DONE', workspace_id: 'ws-default' }
    mockGetTaskById.mockResolvedValue(moved)
    mockMoveTask.mockResolvedValue({ task: moved, oldStatus: 'INBOX' })

    const result = await moveTaskWithBroadcast('t1', 'DONE' as any, 'mcp')

    expect(result).toEqual(moved)
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task:moved',
        payload: expect.objectContaining({ task: moved, oldStatus: 'INBOX', newStatus: 'DONE' }),
      }),
    )
  })
})

describe('workspace column validation', () => {
  const columns = [{ slug: 'LEAD' }, { slug: 'WON' }]

  it('moves to any column of the workspace, including non-default presets', async () => {
    const task = { id: 't1', status: 'LEAD', workspace_id: 'ws-sales' }
    mockGetWorkspaceColumns.mockResolvedValueOnce(columns)
    mockGetTaskById.mockResolvedValue(task)
    mockMoveTask.mockResolvedValue({ task: { ...task, status: 'WON' }, oldStatus: 'LEAD' })

    await expect(moveTaskWithBroadcast('t1', 'WON', 'mcp')).resolves.toMatchObject({
      status: 'WON',
    })
    expect(mockGetWorkspaceColumns).toHaveBeenCalledWith('ws-sales')
  })

  it('refuses a status that is not a column of the workspace', async () => {
    mockGetWorkspaceColumns.mockResolvedValueOnce(columns)
    mockGetTaskById.mockResolvedValue({ id: 't1', status: 'LEAD', workspace_id: 'ws-sales' })

    await expect(moveTaskWithBroadcast('t1', 'IN_PROGRESS', 'mcp')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_STATUS',
    })
    expect(mockMoveTask).not.toHaveBeenCalled()
  })

  it('creates a task without status in the workspace initial column', async () => {
    mockGetWorkspaceColumns.mockResolvedValueOnce([
      { slug: 'LEAD', is_initial_state: false },
      { slug: 'NEW', is_initial_state: true },
    ] as Array<{ slug: string }>)
    mockCreateTask.mockImplementation(async (data: { status?: string }) => ({ id: 't9', ...data }))

    const task = await createTaskWithBroadcast({
      title: 'x',
      workspace_id: 'ws-sales',
      created_by: 'system',
    })

    expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({ status: 'NEW' }))
    expect(task).toMatchObject({ status: 'NEW' })
  })

  it('refuses creating a task in a status the workspace does not have', async () => {
    mockGetWorkspaceColumns.mockResolvedValueOnce(columns)

    await expect(
      createTaskWithBroadcast({
        title: 'x',
        status: 'IN_PROGRESS',
        workspace_id: 'ws-sales',
        created_by: 'system',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS' })
    expect(mockCreateTask).not.toHaveBeenCalled()
  })
})

describe('deleteTaskWithBroadcast', () => {
  it('deletes task and emits event', async () => {
    mockDeleteTask.mockResolvedValue(undefined)

    await deleteTaskWithBroadcast('t1', 'web-ui')

    expect(mockDeleteTask).toHaveBeenCalledWith('t1')
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task:deleted',
        payload: expect.objectContaining({ taskId: 't1' }),
      }),
    )
  })
})

describe('assignTaskWithBroadcast', () => {
  it('assigns task and emits event', async () => {
    const assigned = { id: 't1', status: 'ASSIGNED', assigned_to: 'agent-1' }
    mockAssignTask.mockResolvedValue(assigned)

    const result = await assignTaskWithBroadcast('t1', 'agent-1', 'web-ui')

    expect(result).toEqual(assigned)
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task:assigned',
        payload: expect.objectContaining({ task: assigned, agentId: 'agent-1' }),
      }),
    )
  })

  it('returns null and skips event when task not found', async () => {
    mockAssignTask.mockResolvedValue(null)

    const result = await assignTaskWithBroadcast('unknown', 'agent-1', 'web-ui')

    expect(result).toBeNull()
    expect(mockEventBusEmit).not.toHaveBeenCalled()
  })
})
