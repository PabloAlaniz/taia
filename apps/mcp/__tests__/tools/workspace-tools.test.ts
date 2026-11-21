import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAllWorkspaces = vi.fn()
const mockGetColumnsForWorkspace = vi.fn()

vi.mock('@taia/core/db', () => ({
  getAllWorkspaces: (...args: any[]) => mockGetAllWorkspaces(...args),
  getColumnsForWorkspace: (...args: any[]) => mockGetColumnsForWorkspace(...args),
}))

const mockCreateWorkspaceFromPreset = vi.fn()
const mockUpdateExistingWorkspace = vi.fn()
const mockDeleteExistingWorkspace = vi.fn()
const mockListPresets = vi.fn()

vi.mock('@taia/core/services/workspace.service', () => ({
  createWorkspaceFromPreset: (...args: any[]) => mockCreateWorkspaceFromPreset(...args),
  updateExistingWorkspace: (...args: any[]) => mockUpdateExistingWorkspace(...args),
  deleteExistingWorkspace: (...args: any[]) => mockDeleteExistingWorkspace(...args),
  listPresets: (...args: any[]) => mockListPresets(...args),
}))

import {
  listWorkspacesTool,
  getWorkspaceColumnsTool,
  listPresetsTool,
  createWorkspaceTool,
  updateWorkspaceTool,
  deleteWorkspaceTool,
  workspaceTools,
} from '../../src/tools/workspace-tools'

const SAMPLE_WORKSPACES = [
  { id: 'ws-default', name: 'Default', slug: 'default', icon: '📋', is_default: true },
  { id: 'ws-sales', name: 'Ventas', slug: 'ventas', icon: '💰', is_default: false },
]

const SAMPLE_COLUMNS = [
  {
    slug: 'inbox',
    label: 'Inbox',
    icon: '📥',
    position: 0,
    is_done_state: false,
    is_initial_state: true,
  },
  {
    slug: 'in-progress',
    label: 'In Progress',
    icon: '🔄',
    position: 1,
    is_done_state: false,
    is_initial_state: false,
  },
  {
    slug: 'done',
    label: 'Done',
    icon: '✅',
    position: 2,
    is_done_state: true,
    is_initial_state: false,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listWorkspacesTool', () => {
  it('has correct name and description', () => {
    expect(listWorkspacesTool.name).toBe('taia_list_workspaces')
    expect(listWorkspacesTool.description).toBeTruthy()
  })

  it('returns mapped workspaces', async () => {
    mockGetAllWorkspaces.mockResolvedValue(SAMPLE_WORKSPACES)

    const result = await listWorkspacesTool.handler({})

    expect(result).toEqual({
      workspaces: [
        { id: 'ws-default', name: 'Default', slug: 'default', icon: '📋', is_default: true },
        { id: 'ws-sales', name: 'Ventas', slug: 'ventas', icon: '💰', is_default: false },
      ],
    })
    expect(mockGetAllWorkspaces).toHaveBeenCalledTimes(1)
  })

  it('returns empty array when no workspaces', async () => {
    mockGetAllWorkspaces.mockResolvedValue([])

    const result = await listWorkspacesTool.handler({})

    expect(result).toEqual({ workspaces: [] })
  })
})

describe('getWorkspaceColumnsTool', () => {
  it('has correct name and description', () => {
    expect(getWorkspaceColumnsTool.name).toBe('taia_get_workspace_columns')
    expect(getWorkspaceColumnsTool.description).toBeTruthy()
  })

  it('returns columns for given workspace', async () => {
    mockGetColumnsForWorkspace.mockResolvedValue(SAMPLE_COLUMNS)

    const result = await getWorkspaceColumnsTool.handler({ workspace_id: 'ws-sales' })

    expect(result).toEqual({
      workspace_id: 'ws-sales',
      columns: [
        {
          slug: 'inbox',
          label: 'Inbox',
          icon: '📥',
          position: 0,
          is_done_state: false,
          is_initial_state: true,
        },
        {
          slug: 'in-progress',
          label: 'In Progress',
          icon: '🔄',
          position: 1,
          is_done_state: false,
          is_initial_state: false,
        },
        {
          slug: 'done',
          label: 'Done',
          icon: '✅',
          position: 2,
          is_done_state: true,
          is_initial_state: false,
        },
      ],
    })
    expect(mockGetColumnsForWorkspace).toHaveBeenCalledWith('ws-sales')
  })

  it('defaults to ws-default when no workspace_id provided', async () => {
    mockGetColumnsForWorkspace.mockResolvedValue(SAMPLE_COLUMNS)

    const result = await getWorkspaceColumnsTool.handler({})

    expect(result).toEqual(expect.objectContaining({ workspace_id: 'ws-default' }))
    expect(mockGetColumnsForWorkspace).toHaveBeenCalledWith('ws-default')
  })

  it('returns empty columns for unknown workspace', async () => {
    mockGetColumnsForWorkspace.mockResolvedValue([])

    const result = await getWorkspaceColumnsTool.handler({ workspace_id: 'ws-nonexistent' })

    expect(result).toEqual({
      workspace_id: 'ws-nonexistent',
      columns: [],
    })
  })
})

describe('listPresetsTool', () => {
  it('has correct name and description', () => {
    expect(listPresetsTool.name).toBe('taia_list_presets')
    expect(listPresetsTool.description).toBeTruthy()
  })

  it('returns mapped presets with column slugs', async () => {
    mockListPresets.mockResolvedValue([
      {
        id: 'preset-software-dev',
        name: 'Software Dev',
        description: 'Desarrollo de software',
        icon: '💻',
        columns: [
          {
            slug: 'BACKLOG',
            label: 'Backlog',
            icon: '📥',
            is_initial_state: true,
            is_done_state: false,
          },
          { slug: 'DONE', label: 'Done', icon: '✅', is_initial_state: false, is_done_state: true },
        ],
      },
    ])

    const result = await listPresetsTool.handler({})

    expect(result).toEqual({
      presets: [
        {
          id: 'preset-software-dev',
          name: 'Software Dev',
          description: 'Desarrollo de software',
          icon: '💻',
          columns: ['BACKLOG', 'DONE'],
        },
      ],
    })
    expect(mockListPresets).toHaveBeenCalledTimes(1)
  })

  it('returns empty array when no presets', async () => {
    mockListPresets.mockResolvedValue([])

    const result = await listPresetsTool.handler({})

    expect(result).toEqual({ presets: [] })
  })
})

describe('createWorkspaceTool', () => {
  it('creates workspace from preset', async () => {
    mockCreateWorkspaceFromPreset.mockResolvedValue({
      id: 'ws-new',
      name: 'Sales',
      slug: 'sales',
      icon: '💰',
    })

    const result = await createWorkspaceTool.handler({
      name: 'Sales',
      preset_id: 'preset-ventas',
      icon: '💰',
    })

    expect(result).toEqual({
      created: true,
      workspace: { id: 'ws-new', name: 'Sales', slug: 'sales', icon: '💰' },
    })
    expect(mockCreateWorkspaceFromPreset).toHaveBeenCalledWith('Sales', 'preset-ventas', {
      description: undefined,
      icon: '💰',
      color: undefined,
    })
  })
})

describe('updateWorkspaceTool', () => {
  it('updates workspace', async () => {
    mockUpdateExistingWorkspace.mockResolvedValue({ id: 'ws-1', name: 'Updated' })

    const result = await updateWorkspaceTool.handler({ workspace_id: 'ws-1', name: 'Updated' })

    expect(result).toEqual({ updated: true, workspace: { id: 'ws-1', name: 'Updated' } })
  })

  it('throws when workspace not found', async () => {
    mockUpdateExistingWorkspace.mockResolvedValue(null)

    await expect(updateWorkspaceTool.handler({ workspace_id: 'ws-nope' })).rejects.toThrow(
      'Workspace ws-nope not found',
    )
  })
})

describe('deleteWorkspaceTool', () => {
  it('deletes workspace', async () => {
    mockDeleteExistingWorkspace.mockResolvedValue(true)

    const result = await deleteWorkspaceTool.handler({ workspace_id: 'ws-1' })

    expect(result).toEqual({ deleted: true })
  })
})

describe('workspaceTools array', () => {
  it('contains all 6 tools', () => {
    expect(workspaceTools).toHaveLength(6)
    expect(workspaceTools.map((t) => t.name)).toEqual([
      'taia_list_workspaces',
      'taia_get_workspace_columns',
      'taia_list_presets',
      'taia_create_workspace',
      'taia_update_workspace',
      'taia_delete_workspace',
    ])
  })
})
