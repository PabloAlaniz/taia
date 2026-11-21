import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAddTaskDependency = vi.fn()
const mockRemoveTaskDependency = vi.fn()
const mockGetDependencies = vi.fn()

vi.mock('@taia/core/services/dependency.service', () => ({
  addTaskDependency: (...args: any[]) => mockAddTaskDependency(...args),
  removeTaskDependency: (...args: any[]) => mockRemoveTaskDependency(...args),
  getDependencies: (...args: any[]) => mockGetDependencies(...args),
}))

import {
  addDependencyTool,
  removeDependencyTool,
  getDependenciesTool,
  dependencyTools,
} from '../../src/tools/dependency-tools'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('addDependencyTool', () => {
  it('has correct name and description', () => {
    expect(addDependencyTool.name).toBe('taia_add_dependency')
    expect(addDependencyTool.description).toBeTruthy()
  })

  it('adds and returns dependency info', async () => {
    mockAddTaskDependency.mockResolvedValue({
      id: 'dep-1',
      task_id: 'task-2',
      depends_on_task_id: 'task-1',
    })

    const result = await addDependencyTool.handler({ taskId: 'task-2', dependsOnTaskId: 'task-1' })

    expect(result).toEqual({
      added: true,
      dependency: { id: 'dep-1', task_id: 'task-2', depends_on_task_id: 'task-1' },
    })
    expect(mockAddTaskDependency).toHaveBeenCalledWith('task-2', 'task-1', 'mcp')
  })
})

describe('removeDependencyTool', () => {
  it('has correct name and description', () => {
    expect(removeDependencyTool.name).toBe('taia_remove_dependency')
    expect(removeDependencyTool.description).toBeTruthy()
  })

  it('removes and returns { removed: true }', async () => {
    mockRemoveTaskDependency.mockResolvedValue(undefined)

    const result = await removeDependencyTool.handler({
      taskId: 'task-2',
      dependsOnTaskId: 'task-1',
    })

    expect(result).toEqual({ removed: true })
    expect(mockRemoveTaskDependency).toHaveBeenCalledWith('task-2', 'task-1', 'mcp')
  })
})

describe('getDependenciesTool', () => {
  it('has correct name and description', () => {
    expect(getDependenciesTool.name).toBe('taia_get_dependencies')
    expect(getDependenciesTool.description).toBeTruthy()
  })

  it('returns mapped blockers and dependents', async () => {
    mockGetDependencies.mockResolvedValue({
      blockers: [
        { depends_on_task_id: 'task-1', depends_on_title: 'Setup DB', depends_on_status: 'done' },
      ],
      dependents: [
        { task_id: 'task-3', task_title: 'Deploy', task_status: 'inbox' },
        { task_id: 'task-4', task_title: 'QA Review', task_status: 'inbox' },
      ],
    })

    const result = await getDependenciesTool.handler({ taskId: 'task-2' })

    expect(result).toEqual({
      task_id: 'task-2',
      blockers: [{ id: 'task-1', title: 'Setup DB', status: 'done' }],
      dependents: [
        { id: 'task-3', title: 'Deploy', status: 'inbox' },
        { id: 'task-4', title: 'QA Review', status: 'inbox' },
      ],
    })
    expect(mockGetDependencies).toHaveBeenCalledWith('task-2')
  })
})

describe('dependencyTools array', () => {
  it('has 3 items', () => {
    expect(dependencyTools).toHaveLength(3)
  })
})
