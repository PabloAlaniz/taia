import { getDefaultInstanceConfig } from '../runtime-instances'
import { getSetting, setSetting } from '../db/repositories/setting.repository'
import { logActivity } from '../db/repositories/activity.repository'
import type { PlanResult } from './planning.service'

const MAX_PLANNING_RUNS_PER_WORKSPACE = 50

export type PlanningRunStatus = 'passed' | 'failed'

export interface PlanningRunError {
  code: string
  message: string
  actionable: string
}

export interface PlanningRun {
  id: string
  workspace_id: string
  task_id?: string
  provider: string
  status: PlanningRunStatus
  goal: string
  context?: string
  plan?: PlanResult
  session_key?: string
  run_id?: string
  transcript_summary?: string
  normalized_error?: PlanningRunError
  started_at: string
  completed_at: string
  duration_ms: number
}

export interface StartPlanningRunInput {
  workspace_id: string
  task_id?: string
  goal: string
  context?: string
}

export interface CompletePlanningRunInput extends StartPlanningRunInput {
  started_at: string
  status: PlanningRunStatus
  provider?: string
  plan?: PlanResult
  session_key?: string
  run_id?: string
  transcript_text?: string
  normalized_error?: PlanningRunError
  created_by?: string
}

function planningRunsKey(workspaceId: string) {
  return `planning.runs.${workspaceId}`
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function summarizeTranscript(text?: string): string | undefined {
  if (!text) return undefined
  const compacted = compactWhitespace(text)
  if (!compacted) return undefined
  return compacted.length > 1000 ? `${compacted.slice(0, 1000)}…` : compacted
}

const CONNECTION_FAILURE_MARKERS = [
  'fetch failed',
  'ECONNREFUSED',
  'ENOTFOUND',
  'TimeoutError',
  'connection closed',
  'not connected',
]

function isConnectionFailure(message: string): boolean {
  const lower = message.toLowerCase()
  return CONNECTION_FAILURE_MARKERS.some((marker) => lower.includes(marker.toLowerCase()))
}

export function normalizePlanningError(error: unknown, provider: string): PlanningRunError {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('does not support capability "sessions"')) {
    return {
      code: 'PROVIDER_SESSIONS_UNSUPPORTED',
      message,
      actionable:
        provider === 'cursor'
          ? 'Cursor está detectado, pero todavía no soporta sesiones confiables para Planning. Cambiá a otro runtime con sesiones (Claude Code, Anthropic u OpenClaw).'
          : 'Planning requiere un runtime con sesiones. Configurá un provider compatible antes de generar un plan.',
    }
  }
  if (message.includes('Planning session timed out') || message.includes('timed out')) {
    return {
      code: 'PLANNING_TIMEOUT',
      message,
      actionable:
        'Reintentá con un objetivo más chico o cambiá a un provider más estable para esta generación.',
    }
  }
  if (isConnectionFailure(message)) {
    return {
      code: 'RUNTIME_UNAVAILABLE',
      message,
      actionable: `No se pudo conectar con el runtime "${provider}". Verificá su configuración en /settings/runtime y que esté corriendo.`,
    }
  }
  if (message.includes('Failed to parse AI response as JSON')) {
    return {
      code: 'INVALID_PROVIDER_JSON',
      message,
      actionable:
        'Reintentá la generación; si se repite, ajustá el prompt/contexto o revisá el transcript resumido del provider.',
    }
  }
  return {
    code: 'PLANNING_FAILED',
    message,
    actionable:
      'Revisá la configuración del runtime y el transcript resumido; luego reintentá la generación.',
  }
}

async function persistRun(run: PlanningRun) {
  const key = planningRunsKey(run.workspace_id)
  const currentRaw = await getSetting(key)
  let runs: PlanningRun[] = []
  if (currentRaw) {
    try {
      const parsed = JSON.parse(currentRaw)
      if (Array.isArray(parsed)) runs = parsed
    } catch {
      runs = []
    }
  }
  runs = [run, ...runs.filter((existing) => existing.id !== run.id)].slice(
    0,
    MAX_PLANNING_RUNS_PER_WORKSPACE,
  )
  await setSetting(key, JSON.stringify(runs))
}

export async function listPlanningRuns(
  workspaceId: string,
  taskId?: string,
): Promise<PlanningRun[]> {
  const raw = await getSetting(planningRunsKey(workspaceId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return taskId ? parsed.filter((run: PlanningRun) => run.task_id === taskId) : parsed
  } catch {
    return []
  }
}

export async function completePlanningRun(input: CompletePlanningRunInput): Promise<PlanningRun> {
  const completed = Date.now()
  const started = Date.parse(input.started_at)
  const runtimeConfig = input.provider ? null : await getDefaultInstanceConfig()
  const provider = input.provider || runtimeConfig?.provider || 'unknown'
  const run: PlanningRun = {
    id: `plan_${completed.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    workspace_id: input.workspace_id,
    task_id: input.task_id,
    provider,
    status: input.status,
    goal: input.goal,
    context: input.context,
    plan: input.plan,
    session_key: input.session_key,
    run_id: input.run_id,
    transcript_summary: summarizeTranscript(input.transcript_text),
    normalized_error: input.normalized_error,
    started_at: input.started_at,
    completed_at: new Date(completed).toISOString(),
    duration_ms: Number.isFinite(started) ? completed - started : 0,
  }
  await persistRun(run)
  await logActivity({
    type: 'planning_run',
    agent_id: input.created_by || 'system',
    task_id: input.task_id,
    workspace_id: input.workspace_id,
    message: `Planning ${run.status} with ${provider}${input.task_id ? ` for task ${input.task_id}` : ''}`,
    metadata: {
      run_id: run.id,
      provider,
      status: run.status,
      task_count: run.plan?.tasks.length ?? 0,
      error_code: run.normalized_error?.code,
    },
  })
  return run
}
