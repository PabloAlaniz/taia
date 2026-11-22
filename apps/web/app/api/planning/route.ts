import { NextRequest } from 'next/server'
import { generatePlanWithTelemetry } from '@taia/core/services/planning.service'
import { createTaskWithBroadcast } from '@taia/core/services/task.service'
import { getDefaultInstanceConfig } from '@taia/core/runtime-instances'
import {
  completePlanningRun,
  listPlanningRuns,
  normalizePlanningError,
} from '@taia/core/services/planning-run.service'
import { apiOk, type AppError, ValidationError } from '@taia/core/errors'
import { SpendLimitError } from '@taia/core/spend-limit'
import { withErrorBoundary } from '@taia/core/api-handler'
import { z } from 'zod'
import { validate } from '@taia/core/validation/validate'

const DEFAULT_WORKSPACE_ID = 'ws-default'

const PlanRequestSchema = z.object({
  goal: z.string().min(3).max(2000),
  context: z.string().max(5000).optional(),
  task_id: z.string().optional(),
  workspace_id: z.string().optional(),
})

const CreateFromPlanSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string().optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
      tags: z.array(z.string()).optional(),
      estimated_minutes: z.number().optional(),
      assigned_to: z.string().optional(),
      project: z.string().optional(),
      project_id: z.string().optional(),
      workspace_id: z.string().optional(),
    }),
  ),
  workspace_id: z.string().optional(),
})

function getWorkspaceId(req: NextRequest, bodyWorkspaceId?: string | null) {
  return bodyWorkspaceId || req.headers.get('x-workspace-id') || DEFAULT_WORKSPACE_ID
}

function mapPlanningError(error: unknown, provider: string): AppError {
  if (error instanceof SpendLimitError) return error
  const normalized = normalizePlanningError(error, provider)
  return new ValidationError(normalized.actionable)
}

/**
 * GET /api/planning
 *
 * Lists persisted Planning runs for the active workspace, optionally filtered by task_id.
 */
export const GET = withErrorBoundary(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const workspaceId = getWorkspaceId(req, searchParams.get('workspace_id'))
  const taskId = searchParams.get('task_id') || undefined
  const runs = await listPlanningRuns(workspaceId, taskId)
  return apiOk({ runs, latest_run: runs[0] || null })
})

/**
 * POST /api/planning
 *
 * Two modes:
 * - { goal, context?, task_id? } → Generate a plan, persist a Planning run with provider/transcript/error metadata.
 * - { tasks: [...] }            → Create tasks from a plan (batch create).
 */
export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = await req.json()

  // Mode 1: Generate plan
  if (body.goal) {
    const { goal, context, task_id, workspace_id } = validate(PlanRequestSchema, body)
    const runtimeConfig = await getDefaultInstanceConfig()
    const workspaceId = getWorkspaceId(req, workspace_id)
    const startedAt = new Date().toISOString()

    try {
      const { plan, telemetry } = await generatePlanWithTelemetry({ goal, context })
      const run = await completePlanningRun({
        workspace_id: workspaceId,
        task_id,
        goal,
        context,
        started_at: startedAt,
        status: 'passed',
        provider: telemetry.provider || runtimeConfig.provider,
        plan,
        session_key: telemetry.session_key,
        run_id: telemetry.run_id,
        transcript_text: telemetry.transcript_text,
        created_by: 'planning-wizard',
      })
      return apiOk({ plan, run })
    } catch (error) {
      const provider = runtimeConfig.provider
      const normalized = normalizePlanningError(error, provider)
      await completePlanningRun({
        workspace_id: workspaceId,
        task_id,
        goal,
        context,
        started_at: startedAt,
        status: 'failed',
        provider,
        normalized_error: normalized,
        created_by: 'planning-wizard',
      })

      console.error('[api/planning] generatePlan failed', {
        provider,
        message: normalized.message,
        code: normalized.code,
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw mapPlanningError(error, provider)
    }
  }

  // Mode 2: Create tasks from plan
  if (body.tasks) {
    const { tasks: taskDefs, workspace_id } = validate(CreateFromPlanSchema, body)
    const workspaceId = getWorkspaceId(req, workspace_id)
    const created = []

    for (const taskDef of taskDefs) {
      const task = await createTaskWithBroadcast({
        title: taskDef.title,
        description: taskDef.description,
        priority: taskDef.priority as never,
        tags: taskDef.tags,
        estimated_minutes: taskDef.estimated_minutes,
        assigned_to: taskDef.assigned_to,
        project: taskDef.project,
        project_id: taskDef.project_id,
        workspace_id: taskDef.workspace_id || workspaceId,
        created_by: 'planning-wizard',
      })
      created.push(task)
    }

    return apiOk({ created, count: created.length })
  }

  throw new ValidationError('Request must include either "goal" or "tasks"')
})
