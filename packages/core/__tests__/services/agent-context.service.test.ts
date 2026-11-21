import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentIdentity, ProjectContext, UserProfile } from '@taia/types'

// --- Mocks ---
//
// agent-context.service is a thin orchestrator over db/index. We stub every
// repo call so we can assert (a) versions are inserted with the right
// payload, (b) the active pointer is flipped, (c) projects.glossary /
// knowledge_refs are mirrored on save.

const mockEnsureAgentContextRow = vi.fn()
const mockGetAgentContext = vi.fn()
const mockInsertAgentIdentityVersion = vi.fn()
const mockInsertProjectContextVersion = vi.fn()
const mockInsertUserProfileVersion = vi.fn()
const mockSetActiveAgentIdentityVersion = vi.fn()
const mockSetActiveProjectContextVersion = vi.fn()
const mockSetActiveUserProfileVersion = vi.fn()
const mockUpdateProjectKnowledge = vi.fn()
const mockGetAgentById = vi.fn()
const mockGetAgentIdentityVersion = vi.fn()
const mockEmit = vi.fn()

vi.mock('../../src/events/event-bus', () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}))

vi.mock('../../src/db/index', () => ({
  ensureAgentContextRow: (...args: unknown[]) => mockEnsureAgentContextRow(...args),
  getAgentContext: (...args: unknown[]) => mockGetAgentContext(...args),
  insertAgentIdentityVersion: (...args: unknown[]) => mockInsertAgentIdentityVersion(...args),
  insertProjectContextVersion: (...args: unknown[]) => mockInsertProjectContextVersion(...args),
  insertUserProfileVersion: (...args: unknown[]) => mockInsertUserProfileVersion(...args),
  setActiveAgentIdentityVersion: (...args: unknown[]) => mockSetActiveAgentIdentityVersion(...args),
  setActiveProjectContextVersion: (...args: unknown[]) =>
    mockSetActiveProjectContextVersion(...args),
  setActiveUserProfileVersion: (...args: unknown[]) => mockSetActiveUserProfileVersion(...args),
  updateProjectKnowledge: (...args: unknown[]) => mockUpdateProjectKnowledge(...args),
  getAgentById: (...args: unknown[]) => mockGetAgentById(...args),
  getAgentIdentityVersion: (...args: unknown[]) => mockGetAgentIdentityVersion(...args),
}))

import {
  AGENT_CONTEXT_CHANGED,
  buildInitialIdentity,
  DEFAULT_AGENT_CAPABILITIES,
  getActiveBundleVersionIds,
  restoreAgentIdentity,
  updateAgentIdentity,
  saveAgentIdentity,
  saveProjectContext,
  saveUserProfile,
  setProjectContextForAgent,
  setUserProfileForAgent,
} from '@taia/core/services/agent-context.service'

beforeEach(() => {
  vi.clearAllMocks()
  mockEnsureAgentContextRow.mockResolvedValue(undefined)
  mockSetActiveAgentIdentityVersion.mockResolvedValue(undefined)
  mockSetActiveProjectContextVersion.mockResolvedValue(undefined)
  mockSetActiveUserProfileVersion.mockResolvedValue(undefined)
  mockUpdateProjectKnowledge.mockResolvedValue(undefined)
})

const sampleIdentity: AgentIdentity = {
  id: 'alex',
  name: 'Alex',
  role: 'Reviewer',
  persona: 'careful reviewer',
  instructions: 'always test',
  capabilities: ['read_tasks'],
}

describe('saveAgentIdentity', () => {
  it('ensures the agent_context row, inserts a new version, and points to it', async () => {
    mockInsertAgentIdentityVersion.mockResolvedValueOnce({
      id: 'aiv_123',
      agent_id: 'alex',
      content: sampleIdentity,
      created_at: '',
      created_by: 'user-1',
      note: 'first save',
    })

    const result = await saveAgentIdentity('alex', sampleIdentity, {
      createdBy: 'user-1',
      note: 'first save',
    })

    expect(result.versionId).toBe('aiv_123')
    expect(mockEnsureAgentContextRow).toHaveBeenCalledWith('alex')
    expect(mockInsertAgentIdentityVersion).toHaveBeenCalledWith({
      agentId: 'alex',
      content: sampleIdentity,
      createdBy: 'user-1',
      note: 'first save',
    })
    expect(mockSetActiveAgentIdentityVersion).toHaveBeenCalledWith('alex', 'aiv_123')
  })

  it('ordering: ensureRow → insert → setActive (each previous step must complete first)', async () => {
    const calls: string[] = []
    mockEnsureAgentContextRow.mockImplementation(async () => {
      calls.push('ensure')
    })
    mockInsertAgentIdentityVersion.mockImplementation(async () => {
      calls.push('insert')
      return {
        id: 'aiv_2',
        agent_id: 'alex',
        content: sampleIdentity,
        created_at: '',
        created_by: null,
        note: null,
      }
    })
    mockSetActiveAgentIdentityVersion.mockImplementation(async () => {
      calls.push('setActive')
    })

    await saveAgentIdentity('alex', sampleIdentity)
    expect(calls).toEqual(['ensure', 'insert', 'setActive'])
  })
})

describe('agent-context:changed', () => {
  it('is emitted after an identity save, naming the new version', async () => {
    mockInsertAgentIdentityVersion.mockResolvedValueOnce({ id: 'aiv_9' })

    await saveAgentIdentity('alex', buildInitialIdentity({ id: 'alex', name: 'Alex', role: 'R' }), {
      createdBy: 'ui',
    })

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AGENT_CONTEXT_CHANGED,
        actor: 'ui',
        payload: {
          agentId: 'alex',
          layer: 'agent_identity',
          versionId: 'aiv_9',
        },
      }),
    )
  })
})

describe('buildInitialIdentity', () => {
  it('starts with an empty persona and instructions and default capabilities', () => {
    expect(buildInitialIdentity({ id: 'a', name: 'A', role: 'R' })).toEqual({
      id: 'a',
      name: 'A',
      role: 'R',
      persona: '',
      instructions: '',
      capabilities: [...DEFAULT_AGENT_CAPABILITIES],
    })
  })
})

describe('updateAgentIdentity', () => {
  const current: AgentIdentity = {
    id: 'alex',
    name: 'Alex',
    role: 'Reviewer',
    persona: 'careful',
    instructions: 'always test',
    capabilities: ['read_tasks'],
    constraints: ['never merge'],
  }

  beforeEach(() => {
    mockGetAgentById.mockResolvedValue({ id: 'alex', name: 'Alex DB', role: 'Reviewer DB' })
    mockInsertAgentIdentityVersion.mockResolvedValue({ id: 'aiv_2' })
  })

  it('merges the patch over the active version', async () => {
    mockGetAgentContext.mockResolvedValueOnce({ agent_identity_version_id: 'aiv_1' })
    mockGetAgentIdentityVersion.mockResolvedValueOnce({ id: 'aiv_1', content: current })

    const result = await updateAgentIdentity('alex', { persona: 'updated' }, { note: 'tweak' })

    expect(result).toEqual({ versionId: 'aiv_2', identity: { ...current, persona: 'updated' } })
    expect(mockInsertAgentIdentityVersion).toHaveBeenCalledWith(
      expect.objectContaining({ content: { ...current, persona: 'updated' }, note: 'tweak' }),
    )
  })

  it('falls back to the agent row and defaults when there is no identity yet', async () => {
    mockGetAgentContext.mockResolvedValueOnce(null)

    const { identity } = await updateAgentIdentity('alex', { instructions: 'new' })

    expect(identity).toEqual({
      id: 'alex',
      name: 'Alex DB',
      role: 'Reviewer DB',
      persona: '',
      instructions: 'new',
      capabilities: [...DEFAULT_AGENT_CAPABILITIES],
      constraints: undefined,
    })
  })

  it('throws NotFoundError for an unknown agent', async () => {
    mockGetAgentById.mockResolvedValueOnce(undefined)
    await expect(updateAgentIdentity('ghost', {})).rejects.toThrow("Agent 'ghost' not found")
  })
})

describe('restoreAgentIdentity', () => {
  it('saves the target content as a new version with a default note', async () => {
    const content = buildInitialIdentity({ id: 'alex', name: 'Alex', role: 'R' })
    mockGetAgentIdentityVersion.mockResolvedValueOnce({ id: 'aiv_old', agent_id: 'alex', content })
    mockInsertAgentIdentityVersion.mockResolvedValueOnce({ id: 'aiv_new' })

    const result = await restoreAgentIdentity('alex', 'aiv_old', { createdBy: 'ui:restore' })

    expect(result).toEqual({ versionId: 'aiv_new', identity: content })
    expect(mockInsertAgentIdentityVersion).toHaveBeenCalledWith(
      expect.objectContaining({ content, createdBy: 'ui:restore', note: 'Restored from aiv_old' }),
    )
  })

  it("refuses another agent's version", async () => {
    mockGetAgentIdentityVersion.mockResolvedValueOnce({
      id: 'aiv_x',
      agent_id: 'other',
      content: {},
    })
    await expect(restoreAgentIdentity('alex', 'aiv_x')).rejects.toThrow('not found')
    expect(mockInsertAgentIdentityVersion).not.toHaveBeenCalled()
  })
})

describe('saveProjectContext', () => {
  it('inserts a version and mirrors glossary / knowledge_refs to the projects row', async () => {
    const content: ProjectContext = {
      id: 'p-1',
      name: 'Acme',
      description: 'Acme product',
      glossary: { sla: 'service level agreement' },
      knowledgeRefs: [
        { kind: 'doc', uri: 'docs/policy.md', description: 'policy', cacheable: true },
      ],
    }
    mockInsertProjectContextVersion.mockResolvedValueOnce({
      id: 'pcv_1',
      project_id: 'p-1',
      content,
      created_at: '',
      created_by: null,
      note: null,
    })

    const result = await saveProjectContext('p-1', content, { createdBy: 'admin' })
    expect(result.versionId).toBe('pcv_1')
    expect(mockInsertProjectContextVersion).toHaveBeenCalledWith({
      projectId: 'p-1',
      content,
      createdBy: 'admin',
      note: undefined,
    })
    // The mirror call uses snake_case at the DB boundary.
    expect(mockUpdateProjectKnowledge).toHaveBeenCalledWith('p-1', {
      glossary: content.glossary,
      knowledge_refs: content.knowledgeRefs,
    })
  })
})

describe('saveUserProfile', () => {
  it('inserts a version (no auto-pointer flip — agents pin via setUserProfileForAgent)', async () => {
    const content: UserProfile = { id: 'default', displayName: 'Sam' }
    mockInsertUserProfileVersion.mockResolvedValueOnce({
      id: 'upv_1',
      user_id: 'default',
      content,
      created_at: '',
      created_by: null,
      note: null,
    })

    const result = await saveUserProfile('default', content)
    expect(result.versionId).toBe('upv_1')
    // No agent context manipulation — that's setUserProfileForAgent.
    expect(mockEnsureAgentContextRow).not.toHaveBeenCalled()
    expect(mockSetActiveUserProfileVersion).not.toHaveBeenCalled()
  })
})

describe('setProjectContextForAgent / setUserProfileForAgent', () => {
  it('ensures the agent_context row before flipping the pointer', async () => {
    await setProjectContextForAgent('alex', 'pcv_99')
    expect(mockEnsureAgentContextRow).toHaveBeenCalledWith('alex')
    expect(mockSetActiveProjectContextVersion).toHaveBeenCalledWith('alex', 'pcv_99')

    vi.clearAllMocks()
    await setUserProfileForAgent('alex', 'upv_99')
    expect(mockEnsureAgentContextRow).toHaveBeenCalledWith('alex')
    expect(mockSetActiveUserProfileVersion).toHaveBeenCalledWith('alex', 'upv_99')
  })
})

describe('getActiveBundleVersionIds', () => {
  it('returns an empty object when the agent has no agent_context row', async () => {
    mockGetAgentContext.mockResolvedValueOnce(null)
    const ids = await getActiveBundleVersionIds('alex')
    expect(ids).toEqual({})
  })

  it('returns only the populated keys (skips NULL pointers)', async () => {
    mockGetAgentContext.mockResolvedValueOnce({
      agent_id: 'alex',
      agent_identity_version_id: 'aiv_1',
      project_context_version_id: null,
      user_profile_version_id: 'upv_1',
      updated_at: '',
    })
    const ids = await getActiveBundleVersionIds('alex')
    expect(ids).toEqual({ agent_identity: 'aiv_1', user_profile: 'upv_1' })
  })
})

describe('DEFAULT_AGENT_CAPABILITIES', () => {
  it('contains the six capabilities the AnthropicContextRenderer knows about', () => {
    // Sanity: this list is the contract between setup/workspace creators
    // (which seed it) and the renderer (which must map every entry to
    // a tool). Keep them in lockstep.
    expect([...DEFAULT_AGENT_CAPABILITIES].sort()).toEqual([
      'comment_tasks',
      'memory',
      'read_own_files',
      'read_stats',
      'read_tasks',
      'write_tasks',
    ])
  })
})
