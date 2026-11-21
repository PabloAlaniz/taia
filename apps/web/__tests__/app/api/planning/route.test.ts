import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGeneratePlan = vi.fn()
const mockCreateTask = vi.fn()
const mockGetRuntimeConfig = vi.fn()
const mockCompletePlanningRun = vi.fn()
const mockListPlanningRuns = vi.fn()
const mockNormalizePlanningError = vi.fn()

vi.mock('@taia/core/services/planning.service', () => ({
  generatePlanWithTelemetry: (...args: any[]) => mockGeneratePlan(...args),
}))

vi.mock('@taia/core/services/task.service', () => ({
  createTaskWithBroadcast: (...args: any[]) => mockCreateTask(...args),
}))

vi.mock('@taia/core/runtime-instances', () => ({
  getDefaultInstanceConfig: (...args: any[]) => mockGetRuntimeConfig(...args),
}))

vi.mock('@taia/core/services/planning-run.service', () => ({
  completePlanningRun: (...args: any[]) => mockCompletePlanningRun(...args),
  listPlanningRuns: (...args: any[]) => mockListPlanningRuns(...args),
  normalizePlanningError: (...args: any[]) => mockNormalizePlanningError(...args),
}))

import { GET, POST } from '@/app/api/planning/route'

describe('/api/planning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRuntimeConfig.mockResolvedValue({ provider: 'openclaw', configured: true })
    mockCompletePlanningRun.mockImplementation(async (input) => ({
      id: 'plan-run-1',
      provider: input.provider || 'openclaw',
      status: input.status,
      plan: input.plan,
      normalized_error: input.normalized_error,
      task_id: input.task_id,
      workspace_id: input.workspace_id,
    }))
    mockNormalizePlanningError.mockImplementation((error, provider) => ({
      code: 'PROVIDER_SESSIONS_UNSUPPORTED',
      message: error instanceof Error ? error.message : String(error),
      actionable:
        provider === 'cursor'
          ? 'Cursor está detectado, pero hoy no soporta sesiones confiables para Planning. Probá Claude Code u OpenClaw para generar el plan.'
          : 'Planning requiere un runtime con sesiones. Configura OpenClaw o un provider CLI compatible en Settings antes de generar un plan.',
    }))
  })

  describe('GET', () => {
    it('lists planning runs scoped by workspace and task', async () => {
      mockListPlanningRuns.mockResolvedValue([{ id: 'plan-run-1', status: 'passed' }])
      const req = new NextRequest('http://localhost/api/planning?workspace_id=ws-1&task_id=task-1')

      const res = await GET(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.latest_run.id).toBe('plan-run-1')
      expect(mockListPlanningRuns).toHaveBeenCalledWith('ws-1', 'task-1')
    })
  })

  describe('POST - generate plan', () => {
    it('generates a plan from a goal and persists provider telemetry', async () => {
      mockGeneratePlan.mockResolvedValue({
        plan: {
          tasks: [
            {
              title: 'Setup JWT',
              description: 'Add JWT auth',
              priority: 'HIGH',
              tags: ['backend'],
            },
            {
              title: 'Login page',
              description: 'Create login UI',
              priority: 'MEDIUM',
              tags: ['frontend'],
            },
          ],
        },
        telemetry: {
          provider: 'anthropic',
          session_key: 'sess-1',
          run_id: 'run-1',
          transcript_text: '{"tasks":[{"title":"Setup JWT"}]}',
        },
      })

      const req = new NextRequest('http://localhost/api/planning', {
        method: 'POST',
        headers: { 'x-workspace-id': 'ws-1' },
        body: JSON.stringify({ goal: 'Build auth', task_id: 'task-1' }),
      })

      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.plan.tasks).toHaveLength(2)
      expect(data.run.status).toBe('passed')
      expect(mockCompletePlanningRun).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws-1',
          task_id: 'task-1',
          provider: 'anthropic',
          session_key: 'sess-1',
          run_id: 'run-1',
          status: 'passed',
        }),
      )
    })

    it('persists actionable failed run when runtime has no sessions capability', async () => {
      mockGeneratePlan.mockRejectedValue(
        new Error('Runtime "none" does not support capability "sessions"'),
      )

      const req = new NextRequest('http://localhost/api/planning', {
        method: 'POST',
        headers: { 'x-workspace-id': 'ws-1' },
        body: JSON.stringify({ goal: 'Build auth', task_id: 'task-1' }),
      })

      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toContain('runtime con sesiones')
      expect(data.error).toContain('Settings')
      expect(mockCompletePlanningRun).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws-1',
          task_id: 'task-1',
          status: 'failed',
          normalized_error: expect.objectContaining({ code: 'PROVIDER_SESSIONS_UNSUPPORTED' }),
        }),
      )
    })

    it('rejects request with no goal and no tasks', async () => {
      const req = new NextRequest('http://localhost/api/planning', {
        method: 'POST',
        body: JSON.stringify({}),
      })

      const res = await POST(req)
      const data = await res.json()

      expect(data.ok).toBe(false)
    })
  })

  describe('POST - create tasks', () => {
    it('creates tasks in batch scoped to the requested workspace', async () => {
      mockCreateTask
        .mockResolvedValueOnce({ id: 't1', title: 'Task 1' })
        .mockResolvedValueOnce({ id: 't2', title: 'Task 2' })

      const req = new NextRequest('http://localhost/api/planning', {
        method: 'POST',
        headers: { 'x-workspace-id': 'ws-1' },
        body: JSON.stringify({
          tasks: [
            { title: 'Task 1', priority: 'HIGH' },
            { title: 'Task 2', priority: 'MEDIUM' },
          ],
        }),
      })

      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.created).toHaveLength(2)
      expect(mockCreateTask).toHaveBeenCalledTimes(2)
      expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: 'ws-1' }))
    })
  })
})
