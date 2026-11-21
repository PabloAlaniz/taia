import { exec } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { getActiveWorktreeForTask, getSetting, getWorktreeById, setSetting } from '../db/index'
import { getTaskById } from '../db/repositories/task.repository'
import { logActivity } from '../db/repositories/activity.repository'
import { AppError, NotFoundError } from '../errors'
import { REMOTE_COMMANDS_DISABLED_MESSAGE, remoteCommandsAllowed } from '../command-policy'
import type { Worktree } from '@taia/types'

const execAsync = promisify(exec)
const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 10 * 60_000
const MAX_BUFFER = 1024 * 1024 * 4
const MAX_RUNS_PER_WORKSPACE = 50

export type QaPipelineStatus = 'passed' | 'failed'
export type QaPipelineStepStatus = 'passed' | 'failed' | 'skipped'

export interface QaPipelineStepInput {
  id?: string
  name?: string
  command: string
  timeout_ms?: number
}

export interface QaPipelineStepResult {
  id: string
  name: string
  command: string
  status: QaPipelineStepStatus
  exit_code: number | null
  duration_ms: number
  log_path: string
  stdout_preview: string
  stderr_preview: string
  error?: string
}

export interface QaPipelineRun {
  id: string
  workspace_id: string
  task_id: string
  worktree_id: string
  worktree_path: string
  status: QaPipelineStatus
  started_at: string
  completed_at: string
  duration_ms: number
  artifact_dir: string
  steps: QaPipelineStepResult[]
}

export interface RunQaPipelineInput {
  workspace_id?: string
  task_id?: string
  worktree_id?: string
  steps?: QaPipelineStepInput[]
  created_by?: string
}

function qaPipelineRunsKey(workspaceId: string) {
  return `qaPipeline.runs.${workspaceId}`
}

function getArtifactBasePath() {
  return process.env.TAIA_QA_ARTIFACTS_DIR || join(process.cwd(), '.taia', 'qa-runs')
}

function normalizeStep(step: QaPipelineStepInput, index: number): Required<QaPipelineStepInput> {
  const id = step.id?.trim() || `step-${index + 1}`
  const name = step.name?.trim() || id
  const command = step.command?.trim()
  if (!command)
    throw new AppError(`QA step ${index + 1} is missing command`, 400, 'INVALID_QA_STEP')
  const timeout_ms = Math.min(Math.max(step.timeout_ms || DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS)
  return { id, name, command, timeout_ms }
}

/**
 * Steps from the server environment: `TAIA_QA_STEPS` as a JSON array of
 * `{ id?, name?, command, timeout_ms? }`. Null when unset.
 */
function getEnvSteps(): Required<QaPipelineStepInput>[] | null {
  const raw = process.env.TAIA_QA_STEPS?.trim()
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new AppError('TAIA_QA_STEPS is not valid JSON', 500, 'INVALID_QA_STEPS_ENV')
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new AppError('TAIA_QA_STEPS must be a non-empty JSON array', 500, 'INVALID_QA_STEPS_ENV')
  }
  return (parsed as QaPipelineStepInput[]).map(normalizeStep)
}

function getDefaultSteps(): Required<QaPipelineStepInput>[] {
  return [
    { id: 'git-status', name: 'Git status', command: 'git status --short', timeout_ms: 30_000 },
    {
      id: 'diff-check',
      name: 'Diff whitespace check',
      command: 'git diff --check',
      timeout_ms: 30_000,
    },
  ]
}

function preview(value: string) {
  return value.length > 2000 ? `${value.slice(0, 2000)}\n...[truncated]` : value
}

async function resolveWorktree(
  input: RunQaPipelineInput,
): Promise<{ taskId: string; worktree: Worktree }> {
  if (input.worktree_id) {
    const worktree = await getWorktreeById(input.worktree_id)
    if (!worktree) throw new NotFoundError('Worktree', input.worktree_id)
    return { taskId: worktree.task_id, worktree }
  }

  if (!input.task_id) {
    throw new AppError('Provide task_id or worktree_id', 400, 'TASK_OR_WORKTREE_REQUIRED')
  }

  const task = await getTaskById(input.task_id)
  if (!task) throw new NotFoundError('Task', input.task_id)

  const worktree = await getActiveWorktreeForTask(input.task_id)
  if (!worktree) {
    throw new AppError('Task has no active worktree for QA pipeline', 409, 'NO_ACTIVE_WORKTREE')
  }

  return { taskId: input.task_id, worktree }
}

async function persistRun(run: QaPipelineRun) {
  const key = qaPipelineRunsKey(run.workspace_id)
  const currentRaw = await getSetting(key)
  let runs: QaPipelineRun[] = []
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
    MAX_RUNS_PER_WORKSPACE,
  )
  await setSetting(key, JSON.stringify(runs))
}

export async function listQaPipelineRuns(
  workspaceId: string,
  taskId?: string,
): Promise<QaPipelineRun[]> {
  const raw = await getSetting(qaPipelineRunsKey(workspaceId))
  if (!raw) return []
  let runs: QaPipelineRun[] = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) runs = parsed
  } catch {
    return []
  }
  return taskId ? runs.filter((run) => run.task_id === taskId) : runs
}

export async function runQaPipeline(input: RunQaPipelineInput): Promise<QaPipelineRun> {
  // Steps are shell commands; callers can't pick them unless the operator
  // opted in (command-policy.ts). Otherwise they come from TAIA_QA_STEPS.
  if (input.steps?.length && !remoteCommandsAllowed()) {
    throw new AppError(REMOTE_COMMANDS_DISABLED_MESSAGE, 403, 'REMOTE_COMMANDS_DISABLED')
  }
  const started = Date.now()
  const startedAt = new Date(started).toISOString()
  const { taskId, worktree } = await resolveWorktree(input)

  if (!worktree.worktree_path) {
    throw new AppError(
      'Worktree has no filesystem path for QA pipeline',
      409,
      'WORKTREE_PATH_MISSING',
    )
  }
  if (!['active', 'reviewing'].includes(worktree.status)) {
    throw new AppError(
      `Cannot run QA pipeline on worktree status '${worktree.status}'`,
      409,
      'INVALID_WORKTREE_STATUS',
    )
  }

  const task = await getTaskById(taskId)
  const workspaceId = input.workspace_id || task?.workspace_id || 'ws-default'
  const runId = `qa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const artifactDir = join(getArtifactBasePath(), workspaceId, runId)
  await mkdir(artifactDir, { recursive: true })

  const steps = input.steps?.length
    ? input.steps.map(normalizeStep)
    : (getEnvSteps() ?? getDefaultSteps())
  const results: QaPipelineStepResult[] = []
  let failed = false

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    const stepStarted = Date.now()
    const logPath = join(artifactDir, `${String(index + 1).padStart(2, '0')}-${step.id}.log`)

    if (failed) {
      const skipped: QaPipelineStepResult = {
        id: step.id,
        name: step.name,
        command: step.command,
        status: 'skipped',
        exit_code: null,
        duration_ms: 0,
        log_path: logPath,
        stdout_preview: '',
        stderr_preview: '',
        error: 'Skipped after a previous step failed',
      }
      await writeFile(logPath, 'SKIPPED: previous QA pipeline step failed\n')
      results.push(skipped)
      continue
    }

    try {
      const { stdout, stderr } = await execAsync(step.command, {
        cwd: worktree.worktree_path,
        timeout: step.timeout_ms,
        maxBuffer: MAX_BUFFER,
        env: process.env,
      })
      const durationMs = Date.now() - stepStarted
      await writeFile(
        logPath,
        [
          `$ ${step.command}`,
          `cwd: ${worktree.worktree_path}`,
          `exit_code: 0`,
          '',
          stdout,
          stderr,
        ].join('\n'),
      )
      results.push({
        id: step.id,
        name: step.name,
        command: step.command,
        status: 'passed',
        exit_code: 0,
        duration_ms: durationMs,
        log_path: logPath,
        stdout_preview: preview(stdout),
        stderr_preview: preview(stderr),
      })
    } catch (err) {
      failed = true
      const durationMs = Date.now() - stepStarted
      const error = err as Error & {
        stdout?: string
        stderr?: string
        code?: number | string | null
      }
      const stdout = error.stdout || ''
      const stderr = error.stderr || ''
      const exitCode = typeof error.code === 'number' ? error.code : null
      await writeFile(
        logPath,
        [
          `$ ${step.command}`,
          `cwd: ${worktree.worktree_path}`,
          `exit_code: ${exitCode ?? 'unknown'}`,
          `error: ${error.message}`,
          '',
          stdout,
          stderr,
        ].join('\n'),
      )
      results.push({
        id: step.id,
        name: step.name,
        command: step.command,
        status: 'failed',
        exit_code: exitCode,
        duration_ms: durationMs,
        log_path: logPath,
        stdout_preview: preview(stdout),
        stderr_preview: preview(stderr),
        error: error.message,
      })
    }
  }

  const completed = Date.now()
  const run: QaPipelineRun = {
    id: runId,
    workspace_id: workspaceId,
    task_id: taskId,
    worktree_id: worktree.id,
    worktree_path: worktree.worktree_path,
    status: failed ? 'failed' : 'passed',
    started_at: startedAt,
    completed_at: new Date(completed).toISOString(),
    duration_ms: completed - started,
    artifact_dir: artifactDir,
    steps: results,
  }

  await writeFile(join(artifactDir, 'run.json'), JSON.stringify(run, null, 2))
  await persistRun(run)
  await logActivity({
    type: 'qa_pipeline_run',
    agent_id: input.created_by || 'system',
    task_id: taskId,
    workspace_id: workspaceId,
    message: `QA pipeline ${run.status} for task ${taskId}`,
    metadata: {
      run_id: run.id,
      worktree_id: run.worktree_id,
      artifact_dir: run.artifact_dir,
      steps: run.steps.map((step) => ({
        id: step.id,
        status: step.status,
        log_path: step.log_path,
      })),
    },
  })

  return run
}
