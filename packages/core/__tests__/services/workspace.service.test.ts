import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAllWorkspaces = vi.fn()
const mockGetWorkspaceById = vi.fn()
const mockGetDefaultWorkspace = vi.fn()
const mockCreateWorkspace = vi.fn()
const mockUpdateWorkspace = vi.fn()
const mockDeleteWorkspace = vi.fn()
const mockGetColumnsForWorkspace = vi.fn()
const mockCreateColumn = vi.fn()
const mockGetDoneStateSlugs = vi.fn()
const mockGetInitialSlug = vi.fn()
const mockAddAgentToWorkspace = vi.fn()
const mockGetAllAgents = vi.fn()

vi.mock('@taia/core/db', () => ({
  getAllWorkspaces: (...args: any[]) => mockGetAllWorkspaces(...args),
  getWorkspaceById: (...args: any[]) => mockGetWorkspaceById(...args),
  getDefaultWorkspace: (...args: any[]) => mockGetDefaultWorkspace(...args),
  createWorkspace: (...args: any[]) => mockCreateWorkspace(...args),
  updateWorkspace: (...args: any[]) => mockUpdateWorkspace(...args),
  deleteWorkspace: (...args: any[]) => mockDeleteWorkspace(...args),
  getColumnsForWorkspace: (...args: any[]) => mockGetColumnsForWorkspace(...args),
  createColumn: (...args: any[]) => mockCreateColumn(...args),
  getDoneStateSlugs: (...args: any[]) => mockGetDoneStateSlugs(...args),
  getInitialSlug: (...args: any[]) => mockGetInitialSlug(...args),
  addAgentToWorkspace: (...args: any[]) => mockAddAgentToWorkspace(...args),
  getAllAgents: (...args: any[]) => mockGetAllAgents(...args),
}))

const mockPoolQuery = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: {
    query: (...args: any[]) => mockPoolQuery(...args),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import {
  listWorkspaces,
  getWorkspace,
  getOrCreateDefault,
  createWorkspaceFromPreset,
  createCustomWorkspace,
  updateExistingWorkspace,
  deleteExistingWorkspace,
  getWorkspaceColumns,
  getWorkspaceDoneSlugs,
  getWorkspaceInitialSlug,
  isDoneStatus,
  listPresets,
  createWorkspaceWithSetup,
} from '@taia/core/services/workspace.service'

describe('workspace.service', () => {
  // ---------------------------------------------------------------
  // listWorkspaces
  // ---------------------------------------------------------------
  describe('listWorkspaces', () => {
    it('returns all workspaces', async () => {
      const workspaces = [
        { id: 'ws-1', name: 'Default' },
        { id: 'ws-2', name: 'Dev' },
      ]
      mockGetAllWorkspaces.mockResolvedValue(workspaces)

      const result = await listWorkspaces()

      expect(mockGetAllWorkspaces).toHaveBeenCalledOnce()
      expect(result).toEqual(workspaces)
    })
  })

  // ---------------------------------------------------------------
  // getWorkspace
  // ---------------------------------------------------------------
  describe('getWorkspace', () => {
    it('returns workspace by id', async () => {
      const workspace = { id: 'ws-1', name: 'Default' }
      mockGetWorkspaceById.mockResolvedValue(workspace)

      const result = await getWorkspace('ws-1')

      expect(mockGetWorkspaceById).toHaveBeenCalledWith('ws-1')
      expect(result).toEqual(workspace)
    })

    it('returns undefined when not found', async () => {
      mockGetWorkspaceById.mockResolvedValue(undefined)

      const result = await getWorkspace('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // getOrCreateDefault
  // ---------------------------------------------------------------
  describe('getOrCreateDefault', () => {
    it('returns existing default workspace', async () => {
      const defaultWs = { id: 'ws-default', name: 'Default', is_default: true }
      mockGetDefaultWorkspace.mockResolvedValue(defaultWs)

      const result = await getOrCreateDefault()

      expect(mockGetDefaultWorkspace).toHaveBeenCalledOnce()
      expect(mockCreateWorkspace).not.toHaveBeenCalled()
      expect(result).toEqual(defaultWs)
    })

    it('creates default workspace if none exists', async () => {
      const created = { id: 'ws-new', name: 'Default', slug: 'default' }
      mockGetDefaultWorkspace.mockResolvedValue(undefined)
      mockCreateWorkspace.mockResolvedValue(created)

      const result = await getOrCreateDefault()

      expect(mockCreateWorkspace).toHaveBeenCalledWith({ name: 'Default', slug: 'default' })
      expect(result).toEqual(created)
    })
  })

  // ---------------------------------------------------------------
  // createWorkspaceFromPreset
  // ---------------------------------------------------------------
  describe('createWorkspaceFromPreset', () => {
    it('creates workspace with columns from preset', async () => {
      const preset = {
        id: 'preset-1',
        name: 'Software Dev',
        icon: '💻',
        columns: JSON.stringify([
          {
            slug: 'INBOX',
            label: 'Inbox',
            icon: '📥',
            is_initial_state: true,
            is_done_state: false,
          },
          { slug: 'DONE', label: 'Done', icon: '✅', is_initial_state: false, is_done_state: true },
        ]),
      }
      mockPoolQuery.mockResolvedValueOnce({ rows: [preset] })

      const workspace = { id: 'ws-new', name: 'My Project', slug: 'my-project' }
      mockCreateWorkspace.mockResolvedValue(workspace)
      mockCreateColumn.mockResolvedValue({})
      mockGetAllAgents.mockResolvedValue([])

      const result = await createWorkspaceFromPreset('My Project', 'preset-1')

      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM workspace_presets WHERE id = $1', [
        'preset-1',
      ])
      expect(mockCreateWorkspace).toHaveBeenCalledWith({
        name: 'My Project',
        slug: 'my-project',
        description: undefined,
        icon: '💻',
        color: undefined,
      })
      expect(mockCreateColumn).toHaveBeenCalledTimes(2)
      expect(result).toEqual(workspace)
    })

    it('throws if preset not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      await expect(createWorkspaceFromPreset('Test', 'nonexistent')).rejects.toThrow(
        'Preset not found: nonexistent',
      )
    })

    it('auto-assigns all agents to new workspace', async () => {
      const preset = {
        id: 'preset-1',
        name: 'Dev',
        icon: '💻',
        columns: [{ slug: 'INBOX', label: 'Inbox', is_initial_state: true, is_done_state: false }],
      }
      mockPoolQuery.mockResolvedValueOnce({ rows: [preset] })

      const workspace = { id: 'ws-new', name: 'Test', slug: 'test' }
      mockCreateWorkspace.mockResolvedValue(workspace)
      mockCreateColumn.mockResolvedValue({})
      mockGetAllAgents.mockResolvedValue([
        { id: 'agent-1', name: 'A1' },
        { id: 'agent-2', name: 'A2' },
      ])
      mockAddAgentToWorkspace.mockResolvedValue(undefined)

      await createWorkspaceFromPreset('Test', 'preset-1')

      expect(mockAddAgentToWorkspace).toHaveBeenCalledTimes(2)
      expect(mockAddAgentToWorkspace).toHaveBeenCalledWith('ws-new', 'agent-1')
      expect(mockAddAgentToWorkspace).toHaveBeenCalledWith('ws-new', 'agent-2')
    })

    it('uses provided options over preset defaults', async () => {
      const preset = {
        id: 'preset-1',
        name: 'Dev',
        icon: '💻',
        columns: [],
      }
      mockPoolQuery.mockResolvedValueOnce({ rows: [preset] })
      mockCreateWorkspace.mockResolvedValue({ id: 'ws-1' })
      mockGetAllAgents.mockResolvedValue([])

      await createWorkspaceFromPreset('Test', 'preset-1', {
        description: 'My desc',
        icon: '🚀',
        color: '#ff0000',
      })

      expect(mockCreateWorkspace).toHaveBeenCalledWith({
        name: 'Test',
        slug: 'test',
        description: 'My desc',
        icon: '🚀',
        color: '#ff0000',
      })
    })
  })

  // ---------------------------------------------------------------
  // createCustomWorkspace
  // ---------------------------------------------------------------
  describe('createCustomWorkspace', () => {
    it('creates workspace with slugified name', async () => {
      const workspace = { id: 'ws-1', name: 'My Project', slug: 'my-project' }
      mockCreateWorkspace.mockResolvedValue(workspace)

      const result = await createCustomWorkspace('My Project')

      expect(mockCreateWorkspace).toHaveBeenCalledWith({
        name: 'My Project',
        slug: 'my-project',
        description: undefined,
        icon: undefined,
        color: undefined,
      })
      expect(result).toEqual(workspace)
    })

    it('passes optional fields', async () => {
      mockCreateWorkspace.mockResolvedValue({ id: 'ws-1' })

      await createCustomWorkspace('Test', { description: 'Desc', icon: '🎯', color: '#000' })

      expect(mockCreateWorkspace).toHaveBeenCalledWith({
        name: 'Test',
        slug: 'test',
        description: 'Desc',
        icon: '🎯',
        color: '#000',
      })
    })
  })

  // ---------------------------------------------------------------
  // updateExistingWorkspace
  // ---------------------------------------------------------------
  describe('updateExistingWorkspace', () => {
    it('delegates to updateWorkspace', async () => {
      const updated = { id: 'ws-1', name: 'Updated' }
      mockUpdateWorkspace.mockResolvedValue(updated)

      const result = await updateExistingWorkspace('ws-1', { name: 'Updated' })

      expect(mockUpdateWorkspace).toHaveBeenCalledWith('ws-1', { name: 'Updated' })
      expect(result).toEqual(updated)
    })
  })

  // ---------------------------------------------------------------
  // deleteExistingWorkspace
  // ---------------------------------------------------------------
  describe('deleteExistingWorkspace', () => {
    it('delegates to deleteWorkspace', async () => {
      mockDeleteWorkspace.mockResolvedValue(true)

      const result = await deleteExistingWorkspace('ws-1')

      expect(mockDeleteWorkspace).toHaveBeenCalledWith('ws-1')
      expect(result).toBe(true)
    })
  })

  // ---------------------------------------------------------------
  // getWorkspaceColumns
  // ---------------------------------------------------------------
  describe('getWorkspaceColumns', () => {
    it('returns columns for workspace', async () => {
      const columns = [
        { id: 'col-1', slug: 'INBOX' },
        { id: 'col-2', slug: 'DONE' },
      ]
      mockGetColumnsForWorkspace.mockResolvedValue(columns)

      const result = await getWorkspaceColumns('ws-1')

      expect(mockGetColumnsForWorkspace).toHaveBeenCalledWith('ws-1')
      expect(result).toEqual(columns)
    })
  })

  // ---------------------------------------------------------------
  // getWorkspaceDoneSlugs
  // ---------------------------------------------------------------
  describe('getWorkspaceDoneSlugs', () => {
    it('returns done slugs', async () => {
      mockGetDoneStateSlugs.mockResolvedValue(['DONE', 'ARCHIVED'])

      const result = await getWorkspaceDoneSlugs('ws-1')

      expect(mockGetDoneStateSlugs).toHaveBeenCalledWith('ws-1')
      expect(result).toEqual(['DONE', 'ARCHIVED'])
    })
  })

  // ---------------------------------------------------------------
  // getWorkspaceInitialSlug
  // ---------------------------------------------------------------
  describe('getWorkspaceInitialSlug', () => {
    it('returns initial slug', async () => {
      mockGetInitialSlug.mockResolvedValue('INBOX')

      const result = await getWorkspaceInitialSlug('ws-1')

      expect(mockGetInitialSlug).toHaveBeenCalledWith('ws-1')
      expect(result).toBe('INBOX')
    })

    it('returns INBOX as fallback when no initial slug', async () => {
      mockGetInitialSlug.mockResolvedValue(undefined)

      const result = await getWorkspaceInitialSlug('ws-1')
      expect(result).toBe('INBOX')
    })
  })

  // ---------------------------------------------------------------
  // isDoneStatus
  // ---------------------------------------------------------------
  describe('isDoneStatus', () => {
    it('returns true for done status', async () => {
      mockGetDoneStateSlugs.mockResolvedValue(['DONE', 'ARCHIVED'])

      const result = await isDoneStatus('ws-1', 'DONE')
      expect(result).toBe(true)
    })

    it('returns false for non-done status', async () => {
      mockGetDoneStateSlugs.mockResolvedValue(['DONE', 'ARCHIVED'])

      const result = await isDoneStatus('ws-1', 'IN_PROGRESS')
      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // listPresets
  // ---------------------------------------------------------------
  describe('listPresets', () => {
    it('returns parsed presets', async () => {
      const rows = [
        { id: 'p1', name: 'Dev', columns: JSON.stringify([{ slug: 'INBOX' }]) },
        { id: 'p2', name: 'Sales', columns: [{ slug: 'LEAD' }] },
      ]
      mockPoolQuery.mockResolvedValueOnce({ rows })

      const result = await listPresets()

      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM workspace_presets ORDER BY name')
      expect(result).toHaveLength(2)
      // Stringified columns should be parsed
      expect(result[0].columns).toEqual([{ slug: 'INBOX' }])
      // Already-parsed columns stay as-is
      expect(result[1].columns).toEqual([{ slug: 'LEAD' }])
    })

    it('returns empty array when no presets', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] })

      const result = await listPresets()
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // createWorkspaceWithSetup
  // ---------------------------------------------------------------
  describe('createWorkspaceWithSetup', () => {
    const seededDefault = { id: 'ws-default', name: 'Default', slug: 'default', is_default: true }
    const columns = [{ slug: 'TODO', label: 'To Do' }]

    beforeEach(() => {
      mockGetAllAgents.mockResolvedValue([])
      mockGetColumnsForWorkspace.mockResolvedValue([])
      mockPoolQuery.mockResolvedValue({ rows: [] })
      mockCreateWorkspace.mockImplementation(async (data) => ({ id: 'ws-new', ...data }))
      mockUpdateWorkspace.mockImplementation(async (id, updates) => ({
        ...seededDefault,
        id,
        ...updates,
      }))
    })

    it('sets up the empty default workspace instead of creating a second one', async () => {
      mockGetAllWorkspaces.mockResolvedValue([seededDefault])

      const result = await createWorkspaceWithSetup({ name: 'Producto', columns })

      expect(result.workspace).toMatchObject({ id: 'ws-default', name: 'Producto' })
      expect(mockCreateWorkspace).not.toHaveBeenCalled()
      expect(mockCreateColumn).toHaveBeenCalledWith(
        'ws-default',
        expect.objectContaining({ slug: 'TODO' }),
      )
    })

    it('does the same when the workspace comes from a preset', async () => {
      mockGetAllWorkspaces.mockResolvedValue([seededDefault])
      mockPoolQuery.mockImplementation(async (sql: string) =>
        sql.includes('workspace_presets')
          ? { rows: [{ id: 'preset-x', icon: '⚙️', columns: [{ slug: 'TODO', label: 'To Do' }] }] }
          : { rows: [] },
      )

      const workspace = await createWorkspaceFromPreset('Producto', 'preset-x')

      expect(workspace).toMatchObject({ id: 'ws-default', name: 'Producto', icon: '⚙️' })
      expect(mockCreateWorkspace).not.toHaveBeenCalled()
    })

    it('leaves the default workspace alone when the new one has no columns', async () => {
      mockGetAllWorkspaces.mockResolvedValue([seededDefault])

      const result = await createWorkspaceWithSetup({ name: 'Vacío' })

      expect(result.workspace.id).toBe('ws-new')
      expect(mockUpdateWorkspace).not.toHaveBeenCalled()
    })

    it('creates a new workspace once the default one has columns', async () => {
      mockGetAllWorkspaces.mockResolvedValue([seededDefault])
      mockGetColumnsForWorkspace.mockResolvedValue([{ slug: 'TODO' }])

      const result = await createWorkspaceWithSetup({ name: 'Marketing', columns })

      expect(result.workspace.id).toBe('ws-new')
      expect(mockUpdateWorkspace).not.toHaveBeenCalled()
    })

    it('creates a new workspace when the default one already has tasks', async () => {
      mockGetAllWorkspaces.mockResolvedValue([seededDefault])
      mockPoolQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] })

      const result = await createWorkspaceWithSetup({ name: 'Marketing', columns })

      expect(result.workspace.id).toBe('ws-new')
    })

    it('creates a new workspace when there is more than one already', async () => {
      mockGetAllWorkspaces.mockResolvedValue([seededDefault, { id: 'ws-2', is_default: false }])

      const result = await createWorkspaceWithSetup({ name: 'Marketing', columns })

      expect(result.workspace.id).toBe('ws-new')
    })
  })
})
