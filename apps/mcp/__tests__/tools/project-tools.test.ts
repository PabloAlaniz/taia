import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListProjects = vi.fn()
const mockCreateNewProject = vi.fn()
const mockUpdateExistingProject = vi.fn()
const mockDeleteExistingProject = vi.fn()

vi.mock('@taia/core/services/project.service', () => ({
  listProjects: (...args: any[]) => mockListProjects(...args),
  getProject: vi.fn(),
  createNewProject: (...args: any[]) => mockCreateNewProject(...args),
  updateExistingProject: (...args: any[]) => mockUpdateExistingProject(...args),
  deleteExistingProject: (...args: any[]) => mockDeleteExistingProject(...args),
}))

import {
  listProjectsTool,
  createProjectTool,
  updateProjectTool,
  deleteProjectTool,
  projectTools,
} from '../../src/tools/project-tools'

const SAMPLE_PROJECT = { id: 'proj-1', name: 'TAIA', description: 'Task management platform' }
const SAMPLE_PROJECT_2 = { id: 'proj-2', name: 'Docs', description: 'Documentation site' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listProjectsTool', () => {
  it('has correct name and description', () => {
    expect(listProjectsTool.name).toBe('taia_list_projects')
    expect(listProjectsTool.description).toBeTruthy()
  })

  it('returns projects', async () => {
    mockListProjects.mockResolvedValue([SAMPLE_PROJECT, SAMPLE_PROJECT_2])

    const result = await listProjectsTool.handler({})

    expect(result).toEqual({
      projects: [
        { id: 'proj-1', name: 'TAIA', description: 'Task management platform' },
        { id: 'proj-2', name: 'Docs', description: 'Documentation site' },
      ],
    })
  })
})

describe('createProjectTool', () => {
  it('has correct name and description', () => {
    expect(createProjectTool.name).toBe('taia_create_project')
    expect(createProjectTool.description).toBeTruthy()
  })

  it('creates and returns project', async () => {
    mockCreateNewProject.mockResolvedValue(SAMPLE_PROJECT)

    const result = await createProjectTool.handler({
      name: 'TAIA',
      description: 'Task management platform',
    })

    expect(result).toEqual({ created: true, project: SAMPLE_PROJECT })
    expect(mockCreateNewProject).toHaveBeenCalledWith({
      name: 'TAIA',
      description: 'Task management platform',
    })
  })
})

describe('updateProjectTool', () => {
  it('has correct name and description', () => {
    expect(updateProjectTool.name).toBe('taia_update_project')
    expect(updateProjectTool.description).toBeTruthy()
  })

  it('updates and returns project', async () => {
    const updated = { ...SAMPLE_PROJECT, name: 'TAIA v2' }
    mockUpdateExistingProject.mockResolvedValue(updated)

    const result = await updateProjectTool.handler({ projectId: 'proj-1', name: 'TAIA v2' })

    expect(result).toEqual({ updated: true, project: updated })
    expect(mockUpdateExistingProject).toHaveBeenCalledWith('proj-1', { name: 'TAIA v2' })
  })

  it('throws when not found', async () => {
    mockUpdateExistingProject.mockResolvedValue(null)

    await expect(updateProjectTool.handler({ projectId: 'proj-999', name: 'x' })).rejects.toThrow(
      'Project proj-999 not found',
    )
  })
})

describe('deleteProjectTool', () => {
  it('has correct name and description', () => {
    expect(deleteProjectTool.name).toBe('taia_delete_project')
    expect(deleteProjectTool.description).toBeTruthy()
  })

  it('deletes project', async () => {
    mockDeleteExistingProject.mockResolvedValue(undefined)

    const result = await deleteProjectTool.handler({ projectId: 'proj-1' })

    expect(result).toEqual({ deleted: true })
    expect(mockDeleteExistingProject).toHaveBeenCalledWith('proj-1')
  })
})

describe('projectTools array', () => {
  it('has 4 items', () => {
    expect(projectTools).toHaveLength(4)
  })
})
