import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completePlanningRun,
  listPlanningRuns,
  normalizePlanningError,
  summarizeTranscript,
} from '@taia/core/services/planning-run.service'

const mockGetRuntimeConfig = vi.fn()
const mockGetSetting = vi.fn()
const mockSetSetting = vi.fn()
const mockLogActivity = vi.fn()

vi.mock('@taia/core/runtime-config', () => ({
  getRuntimeConfig: (...args: unknown[]) => mockGetRuntimeConfig(...args),
}))

vi.mock('@taia/core/db/repositories/setting.repository', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
}))

vi.mock('@taia/core/db/repositories/activity.repository', () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}))

describe('planning-run.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRuntimeConfig.mockResolvedValue({ provider: 'anthropic' })
    mockGetSetting.mockResolvedValue(null)
    mockSetSetting.mockResolvedValue(undefined)
    mockLogActivity.mockResolvedValue({ id: 'activity-1' })
  })

  it('persists a successful planning run with provider telemetry and transcript summary', async () => {
    const run = await completePlanningRun({
      workspace_id: 'ws-1',
      task_id: 'task-1',
      goal: 'Build auth',
      started_at: new Date(Date.now() - 10).toISOString(),
      status: 'passed',
      provider: 'openclaw',
      plan: {
        tasks: [
          { title: 'Setup JWT', description: 'Add JWT auth', priority: 'HIGH', tags: ['backend'] },
        ],
      },
      session_key: 'session-1',
      run_id: 'run-1',
      transcript_text: '  {\n  "tasks": []\n  }  ',
      created_by: 'planning-wizard',
    })

    expect(run).toMatchObject({
      workspace_id: 'ws-1',
      task_id: 'task-1',
      provider: 'openclaw',
      status: 'passed',
      session_key: 'session-1',
      run_id: 'run-1',
      transcript_summary: '{ "tasks": [] }',
    })
    expect(mockSetSetting).toHaveBeenCalledWith(
      'planning.runs.ws-1',
      expect.stringContaining(run.id),
    )
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'planning_run',
        agent_id: 'planning-wizard',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        metadata: expect.objectContaining({
          provider: 'openclaw',
          status: 'passed',
          task_count: 1,
        }),
      }),
    )
  })

  it('keeps only latest runs and filters by task', async () => {
    mockGetSetting.mockResolvedValue(
      JSON.stringify([
        { id: 'run-1', workspace_id: 'ws-1', task_id: 'task-1' },
        { id: 'run-2', workspace_id: 'ws-1', task_id: 'task-2' },
      ]),
    )

    await expect(listPlanningRuns('ws-1', 'task-1')).resolves.toEqual([
      { id: 'run-1', workspace_id: 'ws-1', task_id: 'task-1' },
    ])
  })

  it('normalizes provider and timeout failures into actionable errors', () => {
    expect(
      normalizePlanningError(
        new Error('Runtime "cursor" does not support capability "sessions"'),
        'cursor',
      ),
    ).toMatchObject({
      code: 'PROVIDER_SESSIONS_UNSUPPORTED',
      actionable: expect.stringContaining('Cursor'),
    })
    expect(
      normalizePlanningError(new Error('Planning session timed out'), 'anthropic'),
    ).toMatchObject({
      code: 'PLANNING_TIMEOUT',
      actionable: expect.stringContaining('Reintentá'),
    })
  })

  it('reports connection failures as RUNTIME_UNAVAILABLE for any provider', () => {
    for (const provider of ['openclaw', 'anthropic', 'claude-code']) {
      const err = normalizePlanningError(new Error('fetch failed: ECONNREFUSED'), provider)
      expect(err.code).toBe('RUNTIME_UNAVAILABLE')
      expect(err.actionable).toContain(provider)
      expect(err.actionable).toContain('/settings/runtime')
    }
  })

  it('summarizes long transcripts into a compact bounded preview', () => {
    const summary = summarizeTranscript(`a\n${'b'.repeat(1200)}`)
    expect(summary?.length).toBe(1001)
    expect(summary?.endsWith('…')).toBe(true)
  })
})
