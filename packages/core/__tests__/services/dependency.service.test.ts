import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DB functions
const mockGetTaskById = vi.fn()
const mockGetBlockersForTask = vi.fn()
const mockGetDependentsOfTask = vi.fn()
const mockAddDependency = vi.fn()
const mockRemoveDependency = vi.fn()
const mockRemoveDependencyById = vi.fn()
const mockWouldCreateCycle = vi.fn()
const mockAreAllBlockersResolved = vi.fn()
const mockGetUnresolvedBlockerCount = vi.fn()

vi.mock('@taia/core/db', () => ({
  getTaskById: (...args: any[]) => mockGetTaskById(...args),
  getBlockersForTask: (...args: any[]) => mockGetBlockersForTask(...args),
  getDependentsOfTask: (...args: any[]) => mockGetDependentsOfTask(...args),
  addDependency: (...args: any[]) => mockAddDependency(...args),
  removeDependency: (...args: any[]) => mockRemoveDependency(...args),
  removeDependencyById: (...args: any[]) => mockRemoveDependencyById(...args),
  wouldCreateCycle: (...args: any[]) => mockWouldCreateCycle(...args),
  areAllBlockersResolved: (...args: any[]) => mockAreAllBlockersResolved(...args),
  getUnresolvedBlockerCount: (...args: any[]) => mockGetUnresolvedBlockerCount(...args),
}))

vi.mock('@taia/core/events/event-bus', () => ({
  eventBus: { emit: vi.fn(), clear: vi.fn() },
}))

import {
  getDependencies,
  addTaskDependency,
  removeTaskDependency,
  canMoveToDone,
} from '@taia/core/services/dependency.service'

const TASK_A = { id: 'task-a', title: 'Task A', status: 'IN_PROGRESS' }
const TASK_B = { id: 'task-b', title: 'Task B', status: 'INBOX' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getDependencies', () => {
  it('returns blockers and dependents for a task', async () => {
    mockGetTaskById.mockResolvedValue(TASK_A)
    mockGetBlockersForTask.mockResolvedValue([
      {
        id: 'dep-1',
        task_id: 'task-a',
        depends_on_task_id: 'task-b',
        depends_on_title: 'Task B',
        depends_on_status: 'INBOX',
      },
    ])
    mockGetDependentsOfTask.mockResolvedValue([])

    const result = await getDependencies('task-a')

    expect(result.blockers).toHaveLength(1)
    expect(result.blockers[0].depends_on_task_id).toBe('task-b')
    expect(result.dependents).toHaveLength(0)
  })

  it('throws NotFoundError when task does not exist', async () => {
    mockGetTaskById.mockResolvedValue(undefined)
    await expect(getDependencies('nonexistent')).rejects.toThrow(/not found/)
  })
})

describe('addTaskDependency', () => {
  it('adds a dependency successfully', async () => {
    mockGetTaskById.mockImplementation((id: string) =>
      id === 'task-a' ? TASK_A : id === 'task-b' ? TASK_B : undefined,
    )
    mockWouldCreateCycle.mockResolvedValue(false)
    mockAddDependency.mockResolvedValue({
      id: 'dep-1',
      task_id: 'task-a',
      depends_on_task_id: 'task-b',
      created_at: new Date().toISOString(),
    })

    const dep = await addTaskDependency('task-a', 'task-b')

    expect(dep.task_id).toBe('task-a')
    expect(dep.depends_on_task_id).toBe('task-b')
    expect(mockAddDependency).toHaveBeenCalledWith('task-a', 'task-b')
  })

  it('throws when task does not exist', async () => {
    mockGetTaskById.mockImplementation((id: string) => (id === 'task-a' ? TASK_A : undefined))

    await expect(addTaskDependency('task-a', 'nonexistent')).rejects.toThrow(/not found/)
  })

  it('throws on self-dependency', async () => {
    mockGetTaskById.mockResolvedValue(TASK_A)

    await expect(addTaskDependency('task-a', 'task-a')).rejects.toThrow(/cannot depend on itself/i)
  })

  it('throws when cycle would be created', async () => {
    mockGetTaskById.mockImplementation((id: string) =>
      id === 'task-a' ? TASK_A : id === 'task-b' ? TASK_B : undefined,
    )
    mockWouldCreateCycle.mockResolvedValue(true)

    await expect(addTaskDependency('task-a', 'task-b')).rejects.toThrow(/cycle/i)
  })
})

describe('removeTaskDependency', () => {
  it('removes a dependency successfully', async () => {
    mockGetTaskById.mockImplementation((id: string) =>
      id === 'task-a' ? TASK_A : id === 'task-b' ? TASK_B : undefined,
    )
    mockRemoveDependency.mockResolvedValue(true)

    await expect(removeTaskDependency('task-a', 'task-b')).resolves.toBeUndefined()
    expect(mockRemoveDependency).toHaveBeenCalledWith('task-a', 'task-b')
  })

  it('throws when dependency does not exist', async () => {
    mockGetTaskById.mockResolvedValue(TASK_A)
    mockRemoveDependency.mockResolvedValue(false)

    await expect(removeTaskDependency('task-a', 'task-b')).rejects.toThrow(/not found/)
  })
})

describe('canMoveToDone', () => {
  it('returns allowed true when no unresolved blockers', async () => {
    mockGetUnresolvedBlockerCount.mockResolvedValue(0)
    const result = await canMoveToDone('task-a')
    expect(result.allowed).toBe(true)
    expect(result.unresolvedCount).toBe(0)
  })

  it('returns allowed false when there are unresolved blockers', async () => {
    mockGetUnresolvedBlockerCount.mockResolvedValue(2)
    const result = await canMoveToDone('task-a')
    expect(result.allowed).toBe(false)
    expect(result.unresolvedCount).toBe(2)
  })
})
