import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks (must be declared before vi.mock calls) ---

const mockSpawnSession = vi.fn()
const mockGetSessionHistory = vi.fn()
const mockAwaitSessionComplete = vi.fn()

vi.mock('@taia/core/runtime', () => ({
  getDefaultRuntimeAdapter: vi.fn(() =>
    Promise.resolve({
      id: 'openclaw',
      capabilities: { has: () => true, list: () => [] },
      spawnSession: mockSpawnSession,
      getSessionHistory: mockGetSessionHistory,
      awaitSessionComplete: mockAwaitSessionComplete,
    }),
  ),
}))

import { generatePlan } from '@taia/core/services/planning.service'

// --- Helpers ---

const validPlanJson = {
  tasks: [
    {
      title: 'Implement user authentication',
      description: 'Add login/signup endpoints with JWT tokens',
      priority: 'HIGH' as const,
      tags: ['backend', 'auth'],
      estimated_minutes: 120,
    },
    {
      title: 'Add database migration for users table',
      description: 'Create the users table with email, password_hash, and timestamps',
      priority: 'HIGH' as const,
      tags: ['database'],
      estimated_minutes: 30,
    },
  ],
}

function mockAssistantResponse(content: unknown) {
  mockGetSessionHistory.mockResolvedValue([{ role: 'assistant', content }])
}

// --- Setup ---

beforeEach(() => {
  vi.clearAllMocks()
  mockSpawnSession.mockResolvedValue({
    sessionKey: 'planning-sess-123',
    runId: 'planning-run-123',
  })
  mockAwaitSessionComplete.mockResolvedValue(undefined)
})

// ===================================================================
// generatePlan — runtime adapter
// ===================================================================

describe('generatePlan via runtime adapter', () => {
  it('returns parsed plan from valid JSON response', async () => {
    mockAssistantResponse(JSON.stringify(validPlanJson))

    const result = await generatePlan({ goal: 'Build user auth system' })

    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[0].title).toBe('Implement user authentication')
    expect(result.tasks[0].priority).toBe('HIGH')
    expect(result.tasks[0].tags).toEqual(['backend', 'auth'])
    expect(result.tasks[0].estimated_minutes).toBe(120)
  })

  it('calls spawnSession with correct params', async () => {
    mockAssistantResponse(JSON.stringify(validPlanJson))

    await generatePlan({ goal: 'Build dashboard' })

    expect(mockSpawnSession).toHaveBeenCalledWith(
      expect.stringContaining('Build dashboard'),
      expect.objectContaining({
        label: 'planning-wizard',
        runTimeoutSeconds: 60,
      }),
    )
  })

  it('includes context parameter in prompt', async () => {
    mockAssistantResponse(JSON.stringify(validPlanJson))

    await generatePlan({
      goal: 'Build auth',
      context: 'We use PostgreSQL and Next.js',
    })

    const prompt = mockSpawnSession.mock.calls[0][0]
    expect(prompt).toContain('Goal: Build auth')
    expect(prompt).toContain('Additional context: We use PostgreSQL and Next.js')
  })

  it('handles thinking blocks (extended thinking models)', async () => {
    mockAssistantResponse([
      { type: 'thinking', thinking: 'Let me analyze...' },
      { type: 'text', text: JSON.stringify(validPlanJson) },
    ])

    const result = await generatePlan({ goal: 'Build auth' })

    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[0].title).toBe('Implement user authentication')
  })

  it('parses markdown-wrapped JSON response', async () => {
    const wrapped = '```json\n' + JSON.stringify(validPlanJson) + '\n```'
    mockAssistantResponse(wrapped)

    const result = await generatePlan({ goal: 'Build auth' })

    expect(result.tasks).toHaveLength(2)
  })

  it('parses JSON embedded in surrounding text', async () => {
    const embedded =
      'Here is the plan:\n' + JSON.stringify(validPlanJson) + '\nLet me know if you need changes.'
    mockAssistantResponse(embedded)

    const result = await generatePlan({ goal: 'Build auth' })

    expect(result.tasks).toHaveLength(2)
  })

  it('throws on invalid JSON in response', async () => {
    mockAssistantResponse('This is not valid JSON at all {{{')

    await expect(generatePlan({ goal: 'anything' })).rejects.toThrow(
      'Failed to parse AI response as JSON',
    )
  })

  it('throws on valid JSON but wrong schema', async () => {
    const invalidSchema = { tasks: [{ name: 'wrong field' }] }
    mockAssistantResponse(JSON.stringify(invalidSchema))

    await expect(generatePlan({ goal: 'anything' })).rejects.toThrow('Invalid plan structure')
  })

  it('accepts response with extra fields (Zod strips them)', async () => {
    const extraFields = {
      tasks: [
        {
          title: 'Setup CI pipeline',
          description: 'Configure GitHub Actions',
          priority: 'MEDIUM',
          tags: ['devops'],
          estimated_minutes: 60,
          extra_field: 'should be ignored',
        },
      ],
      summary: 'This extra field should not cause failure',
    }
    mockAssistantResponse(JSON.stringify(extraFields))

    const result = await generatePlan({ goal: 'Setup CI' })

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].title).toBe('Setup CI pipeline')
    expect((result.tasks[0] as any).extra_field).toBeUndefined()
  })

  it('throws on spawn failure', async () => {
    mockSpawnSession.mockRejectedValue(new Error('Gateway not configured'))

    await expect(generatePlan({ goal: 'anything' })).rejects.toThrow('Gateway not configured')
  })

  it('times out when no assistant response arrives', async () => {
    mockGetSessionHistory.mockResolvedValue([]) // No messages

    await expect(generatePlan({ goal: 'anything' })).rejects.toThrow('Planning session timed out')
  })

  it('times out when awaitSessionComplete rejects (gateway silent)', async () => {
    mockAwaitSessionComplete.mockRejectedValue(new Error('awaitSessionComplete: timeout'))

    await expect(generatePlan({ goal: 'anything' })).rejects.toThrow('Planning session timed out')
  })

  it('handles string content (non-array)', async () => {
    mockAssistantResponse(JSON.stringify(validPlanJson))

    const result = await generatePlan({ goal: 'Build auth' })

    expect(result.tasks).toHaveLength(2)
  })
})
