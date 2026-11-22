import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetProjectById = vi.fn()
const mockGetRepositoriesForProject = vi.fn()
const mockGetAllTasks = vi.fn()
const mockGetAllWorkspaces = vi.fn()
const mockGetColumnsForWorkspace = vi.fn()

vi.mock('../../src/db/index', () => ({
  getProjectById: (...a: unknown[]) => mockGetProjectById(...a),
  getRepositoriesForProject: (...a: unknown[]) => mockGetRepositoriesForProject(...a),
  getAllTasks: (...a: unknown[]) => mockGetAllTasks(...a),
  getAllWorkspaces: (...a: unknown[]) => mockGetAllWorkspaces(...a),
  getColumnsForWorkspace: (...a: unknown[]) => mockGetColumnsForWorkspace(...a),
}))
vi.mock('../../src/services/activity.service', () => ({}))

import { getProjectOverview } from '@taia/core/services/project.service'

beforeEach(() => {
  vi.resetAllMocks()
  mockGetRepositoriesForProject.mockResolvedValue([])
  mockGetColumnsForWorkspace.mockImplementation(async (id: string) => [
    { id: `${id}-c1`, workspace_id: id, slug: 'TODO', label: 'To do', position: 0 },
  ])
})

describe('getProjectOverview', () => {
  it('returns undefined for an unknown project', async () => {
    mockGetProjectById.mockResolvedValue(undefined)
    expect(await getProjectOverview('nope')).toBeUndefined()
    expect(mockGetAllTasks).not.toHaveBeenCalled()
  })

  it("groups the project's tasks by workspace, each with its columns", async () => {
    mockGetProjectById.mockResolvedValue({ id: 'p1', name: 'Client' })
    mockGetAllWorkspaces.mockResolvedValue([
      { id: 'ws-write', name: 'Writing' },
      { id: 'ws-code', name: 'Coding' },
      { id: 'ws-empty', name: 'Empty' },
    ])
    mockGetAllTasks.mockResolvedValue([
      { id: 't1', project_id: 'p1', workspace_id: 'ws-code' },
      { id: 't2', project_id: 'p1', workspace_id: 'ws-write' },
      { id: 't3', project_id: 'p1', workspace_id: 'ws-code' },
      { id: 't4', project_id: 'other', workspace_id: 'ws-empty' },
    ])

    const overview = await getProjectOverview('p1')

    expect(overview!.workspaces.map((g) => g.workspace.name)).toEqual(['Coding', 'Writing'])
    expect(overview!.workspaces[0].tasks.map((t) => t.id)).toEqual(['t1', 't3'])
    expect(overview!.workspaces[0].columns[0].workspace_id).toBe('ws-code')
    expect(mockGetColumnsForWorkspace).not.toHaveBeenCalledWith('ws-empty')
  })
})
