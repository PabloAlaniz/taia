import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentIdentity } from '@taia/types'

// --- Mocks ---
//
// context.service is a read-only assembler over db/index. Every read is
// stubbed so we can exercise the bundle-shaping logic directly.

const mockGetAgentById = vi.fn()
const mockGetDefaultWorkspace = vi.fn()
const mockGetAllTasks = vi.fn()
const mockListAgentMemories = vi.fn()

const mockGetAgentContext = vi.fn()
const mockGetAgentIdentityVersion = vi.fn()
const mockGetProjectByIdFull = vi.fn()
const mockGetProjectContextVersion = vi.fn()
const mockGetUserProfileVersion = vi.fn()
const mockGetLatestUserProfileVersion = vi.fn()
const mockGetAgentWorkingState = vi.fn()
const mockGetActiveWorktreeForTask = vi.fn()

vi.mock('../../src/db/index', () => ({
  getAgentById: (...args: unknown[]) => mockGetAgentById(...args),
  getDefaultWorkspace: (...args: unknown[]) => mockGetDefaultWorkspace(...args),
  getAllTasks: (...args: unknown[]) => mockGetAllTasks(...args),
  listAgentMemories: (...args: unknown[]) => mockListAgentMemories(...args),
  getAgentContext: (...args: unknown[]) => mockGetAgentContext(...args),
  getAgentIdentityVersion: (...args: unknown[]) => mockGetAgentIdentityVersion(...args),
  getProjectByIdFull: (...args: unknown[]) => mockGetProjectByIdFull(...args),
  getProjectContextVersion: (...args: unknown[]) => mockGetProjectContextVersion(...args),
  getUserProfileVersion: (...args: unknown[]) => mockGetUserProfileVersion(...args),
  getLatestUserProfileVersion: (...args: unknown[]) => mockGetLatestUserProfileVersion(...args),
  getAgentWorkingState: (...args: unknown[]) => mockGetAgentWorkingState(...args),
  getActiveWorktreeForTask: (...args: unknown[]) => mockGetActiveWorktreeForTask(...args),
}))

import { getAgentContextSummary, loadAgentContextBundle } from '@taia/core/services/context.service'

beforeEach(() => {
  vi.resetAllMocks()
  // Default: agent has no agent_context row yet.
  mockGetAgentContext.mockResolvedValue(null)
  mockGetDefaultWorkspace.mockResolvedValue(undefined)
  mockGetAllTasks.mockResolvedValue([])
  mockListAgentMemories.mockResolvedValue([])
  mockGetUserProfileVersion.mockResolvedValue(null)
  mockGetLatestUserProfileVersion.mockResolvedValue(null)
  mockGetProjectContextVersion.mockResolvedValue(null)
  mockGetProjectByIdFull.mockResolvedValue(undefined)
  mockGetAgentWorkingState.mockResolvedValue(null)
  mockGetActiveWorktreeForTask.mockResolvedValue(undefined)
})

/** Give `alex` an active typed identity (optionally with extra fields). */
function withIdentity(overrides: Partial<AgentIdentity> = {}): void {
  mockGetAgentContext.mockResolvedValue({
    agent_id: 'alex',
    agent_identity_version_id: 'v_id',
    project_context_version_id: null,
    user_profile_version_id: null,
    updated_at: new Date().toISOString(),
  })
  mockGetAgentIdentityVersion.mockResolvedValue({
    id: 'v_id',
    agent_id: 'alex',
    content: {
      id: 'alex',
      name: 'Alex',
      role: 'Reviewer',
      persona: 'soul',
      instructions: 'heartbeat',
      capabilities: [],
      ...overrides,
    } satisfies AgentIdentity,
    created_at: '',
    created_by: null,
    note: null,
  })
}

describe('loadAgentContextBundle', () => {
  it('returns null when the agent does not exist', async () => {
    mockGetAgentById.mockResolvedValueOnce(undefined)
    const bundle = await loadAgentContextBundle('ghost')
    expect(bundle).toBeNull()
  })

  it('returns null without writing when the agent has no typed identity', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex', role: 'Reviewer' })
    // Without an identity there is no bundle.

    const bundle = await loadAgentContextBundle('alex')

    expect(bundle).toBeNull()
  })

  it('reads the typed identity from the active version', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
    mockGetAgentContext.mockResolvedValueOnce({
      agent_id: 'alex',
      agent_identity_version_id: 'v_existing',
      project_context_version_id: null,
      user_profile_version_id: null,
      updated_at: new Date().toISOString(),
    })
    mockGetAgentIdentityVersion.mockResolvedValueOnce({
      id: 'v_existing',
      agent_id: 'alex',
      content: {
        id: 'alex',
        name: 'Alex (typed)',
        role: 'Reviewer',
        persona: 'edited via UI',
        instructions: 'updated instructions',
        capabilities: ['read_tasks'],
      } satisfies AgentIdentity,
      created_at: '',
      created_by: 'user-1',
      note: null,
    })

    const bundle = await loadAgentContextBundle('alex')
    expect(bundle!.agent.name).toBe('Alex (typed)')
    expect(bundle!.agent.persona).toBe('edited via UI')
    expect(bundle!.agent.capabilities).toEqual(['read_tasks'])
  })

  it('reads project from a pinned project_context_version when set', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
    mockGetAgentContext.mockResolvedValueOnce({
      agent_id: 'alex',
      agent_identity_version_id: 'v_id',
      project_context_version_id: 'v_proj',
      user_profile_version_id: null,
      updated_at: new Date().toISOString(),
    })
    mockGetAgentIdentityVersion.mockResolvedValueOnce({
      id: 'v_id',
      agent_id: 'alex',
      content: {
        id: 'alex',
        name: 'Alex',
        role: 'Reviewer',
        persona: '',
        instructions: '',
        capabilities: [],
      },
      created_at: '',
      created_by: null,
      note: null,
    })
    mockGetProjectContextVersion.mockResolvedValueOnce({
      id: 'v_proj',
      project_id: 'p-1',
      content: {
        id: 'p-1',
        name: 'Acme',
        description: 'Acme product',
        glossary: { sla: 'service level agreement' },
      },
      created_at: '',
      created_by: null,
      note: null,
    })

    const bundle = await loadAgentContextBundle('alex')
    expect(bundle!.project.name).toBe('Acme')
    expect(bundle!.project.glossary).toEqual({ sla: 'service level agreement' })
    // No fallback to default workspace when version is present.
    expect(mockGetDefaultWorkspace).not.toHaveBeenCalled()
  })

  it('falls back to agents.project_id when no project_context_version is pinned', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex', project_id: 'p-1' })
    mockGetAgentContext.mockResolvedValueOnce({
      agent_id: 'alex',
      agent_identity_version_id: 'v_id',
      project_context_version_id: null,
      user_profile_version_id: null,
      updated_at: new Date().toISOString(),
    })
    mockGetAgentIdentityVersion.mockResolvedValueOnce({
      id: 'v_id',
      agent_id: 'alex',
      content: {
        id: 'alex',
        name: 'Alex',
        role: 'Reviewer',
        persona: '',
        instructions: '',
        capabilities: [],
      },
      created_at: '',
      created_by: null,
      note: null,
    })
    mockGetProjectByIdFull.mockResolvedValueOnce({
      id: 'p-1',
      name: 'Project Alpha',
      description: 'desc',
      glossary: null,
      knowledge_refs: null,
      created_at: '',
      updated_at: '',
    })

    const bundle = await loadAgentContextBundle('alex')
    expect(bundle!.project.id).toBe('p-1')
    expect(bundle!.project.name).toBe('Project Alpha')
  })

  describe('project layer follows the current task', () => {
    const projectRow = (id: string, name: string) => ({
      id,
      name,
      description: `${name} description`,
      glossary: { term: `${name} term` },
      knowledge_refs: null,
      created_at: '',
      updated_at: '',
    })

    beforeEach(() => {
      mockGetProjectByIdFull.mockImplementation(async (id: string) =>
        id === 'p-client' ? projectRow('p-client', 'Client') : projectRow('p-home', 'Home'),
      )
    })

    it("uses the task's project over the agent's own project", async () => {
      mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex', project_id: 'p-home' })
      withIdentity()
      mockGetAllTasks.mockResolvedValueOnce([
        {
          id: 't1',
          title: 'T',
          status: 'IN_PROGRESS',
          assigned_to: 'alex',
          project_id: 'p-client',
        },
      ])

      const bundle = await loadAgentContextBundle('alex')
      expect(bundle!.project.id).toBe('p-client')
      expect(bundle!.project.glossary).toEqual({ term: 'Client term' })
    })

    it("uses the task's project over a pin to another project", async () => {
      mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
      withIdentity()
      mockGetAgentContext.mockResolvedValue({
        agent_id: 'alex',
        agent_identity_version_id: 'v_id',
        project_context_version_id: 'v_home',
        user_profile_version_id: null,
        updated_at: '',
      })
      mockGetProjectContextVersion.mockResolvedValue({
        id: 'v_home',
        project_id: 'p-home',
        content: { id: 'p-home', name: 'Home pinned' },
      })
      mockGetAllTasks.mockResolvedValueOnce([
        {
          id: 't1',
          title: 'T',
          status: 'IN_PROGRESS',
          assigned_to: 'alex',
          project_id: 'p-client',
        },
      ])

      const bundle = await loadAgentContextBundle('alex')
      expect(bundle!.project.name).toBe('Client')
    })

    it("keeps a pin that is a version of the task's project", async () => {
      mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
      withIdentity()
      mockGetAgentContext.mockResolvedValue({
        agent_id: 'alex',
        agent_identity_version_id: 'v_id',
        project_context_version_id: 'v_client_old',
        user_profile_version_id: null,
        updated_at: '',
      })
      mockGetProjectContextVersion.mockResolvedValue({
        id: 'v_client_old',
        project_id: 'p-client',
        content: { id: 'p-client', name: 'Client (pinned version)' },
      })
      mockGetAllTasks.mockResolvedValueOnce([
        {
          id: 't1',
          title: 'T',
          status: 'IN_PROGRESS',
          assigned_to: 'alex',
          project_id: 'p-client',
        },
      ])

      const bundle = await loadAgentContextBundle('alex')
      expect(bundle!.project.name).toBe('Client (pinned version)')
    })

    it("falls back to the agent's project when the task has none", async () => {
      mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex', project_id: 'p-home' })
      withIdentity()
      mockGetAllTasks.mockResolvedValueOnce([
        { id: 't1', title: 'T', status: 'IN_PROGRESS', assigned_to: 'alex', project_id: null },
      ])

      const bundle = await loadAgentContextBundle('alex')
      expect(bundle!.project.id).toBe('p-home')
    })

    it("falls back to the agent's project when the task's project was deleted", async () => {
      mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex', project_id: 'p-home' })
      withIdentity()
      mockGetProjectByIdFull.mockImplementation(async (id: string) =>
        id === 'p-home' ? projectRow('p-home', 'Home') : undefined,
      )
      mockGetAllTasks.mockResolvedValueOnce([
        { id: 't1', title: 'T', status: 'IN_PROGRESS', assigned_to: 'alex', project_id: 'p-gone' },
      ])

      const bundle = await loadAgentContextBundle('alex')
      expect(bundle!.project.id).toBe('p-home')
    })
  })

  it('prefers an in-progress task over the most recent one', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
    mockGetAgentWorkingState.mockResolvedValue({ content: 'Halfway through file 3.' })
    mockGetActiveWorktreeForTask.mockImplementation(async (taskId: string) =>
      taskId === 't-active'
        ? { worktree_path: '/wt/t-active', branch_name: 'taia/t-active', base_branch: 'main' }
        : undefined,
    )
    withIdentity()
    mockGetAllTasks.mockResolvedValueOnce([
      {
        id: 't-old',
        title: 'Old',
        description: 'old desc',
        priority: 'LOW',
        status: 'INBOX',
        assigned_to: 'alex',
      },
      {
        id: 't-active',
        title: 'Active',
        description: 'active desc',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        assigned_to: 'alex',
      },
    ])

    const bundle = await loadAgentContextBundle('alex')
    expect(bundle!.task.taskId).toBe('t-active')
    expect(bundle!.task.priority).toBe('HIGH')
    expect(bundle!.task.workingState).toBe('Halfway through file 3.')
    expect(bundle!.task.workspace).toEqual({
      path: '/wt/t-active',
      branch: 'taia/t-active',
      baseBranch: 'main',
    })
  })

  it('falls back to a placeholder briefing when the agent has no tasks', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
    withIdentity()

    const bundle = await loadAgentContextBundle('alex')
    expect(bundle!.task.title).toBe('Heartbeat')
    expect(bundle!.task.taskId).toBeUndefined()
  })

  it('maps agent_memory paths into archival refs', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
    withIdentity()
    mockListAgentMemories.mockResolvedValueOnce([
      { agent_id: 'alex', path: '/memories/preferences.md', content: 'big' },
      { agent_id: 'alex', path: '/memories/glossary.md', content: 'more' },
    ])

    const bundle = await loadAgentContextBundle('alex')
    expect(bundle!.memory.archival).toEqual([
      { uri: '/memories/preferences.md' },
      { uri: '/memories/glossary.md' },
    ])
  })
})

describe('getAgentContextSummary', () => {
  it('reports which context parts are filled in', async () => {
    withIdentity({ persona: 'Careful.', instructions: '   ' })
    mockGetAgentWorkingState.mockResolvedValue({ content: 'notes' })
    mockListAgentMemories.mockResolvedValue([{ path: '/memories/prefs.md' }])

    await expect(getAgentContextSummary('alex')).resolves.toEqual({
      persona: true,
      instructions: false,
      workingNotes: true,
      memoryFiles: ['prefs.md'],
    })
    expect(mockListAgentMemories).toHaveBeenCalledWith('alex', { pathPrefix: '/memories/' })
  })
})
