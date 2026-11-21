import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listQaPipelineRuns, runQaPipeline } from '@taia/core/services/qa-pipeline.service'

const mockGetActiveWorktreeForTask = vi.fn()
const mockGetSetting = vi.fn()
const mockGetTaskById = vi.fn()
const mockGetWorktreeById = vi.fn()
const mockLogActivity = vi.fn()
const mockSetSetting = vi.fn()

vi.mock('@taia/core/db/index', () => ({
  getActiveWorktreeForTask: (...args: unknown[]) => mockGetActiveWorktreeForTask(...args),
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  getWorktreeById: (...args: unknown[]) => mockGetWorktreeById(...args),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
}))

vi.mock('@taia/core/db/repositories/task.repository', () => ({
  getTaskById: (...args: unknown[]) => mockGetTaskById(...args),
}))

vi.mock('@taia/core/db/repositories/activity.repository', () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}))

describe('qa-pipeline.service', () => {
  let tempDir: string
  let previousArtifactsDir: string | undefined

  beforeEach(async () => {
    vi.clearAllMocks()
    tempDir = await mkdtemp(join(tmpdir(), 'taia-qa-pipeline-'))
    previousArtifactsDir = process.env.TAIA_QA_ARTIFACTS_DIR
    process.env.TAIA_QA_ARTIFACTS_DIR = join(tempDir, 'artifacts')
    // Most tests pass their own steps, which needs the operator opt-in.
    process.env.TAIA_ALLOW_REMOTE_COMMANDS = '1'
    mockGetTaskById.mockResolvedValue({ id: 'task-1', workspace_id: 'ws-1', title: 'Task 1' })
    mockGetActiveWorktreeForTask.mockResolvedValue({
      id: 'wt-1',
      task_id: 'task-1',
      repository_id: 'repo-1',
      branch_name: 'agent/task-1',
      base_branch: 'main',
      worktree_path: tempDir,
      status: 'active',
      merge_strategy: 'squash',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    mockGetSetting.mockResolvedValue(null)
    mockSetSetting.mockResolvedValue(undefined)
    mockLogActivity.mockResolvedValue({ id: 'activity-1' })
  })

  afterEach(async () => {
    if (previousArtifactsDir === undefined) delete process.env.TAIA_QA_ARTIFACTS_DIR
    else process.env.TAIA_QA_ARTIFACTS_DIR = previousArtifactsDir
    delete process.env.TAIA_ALLOW_REMOTE_COMMANDS
    delete process.env.TAIA_QA_STEPS
    await rm(tempDir, { recursive: true, force: true })
  })

  it('refuses caller-supplied steps without the operator opt-in', async () => {
    delete process.env.TAIA_ALLOW_REMOTE_COMMANDS

    await expect(
      runQaPipeline({ task_id: 'task-1', steps: [{ command: 'touch /tmp/pwned' }] }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'REMOTE_COMMANDS_DISABLED' })
    expect(mockGetActiveWorktreeForTask).not.toHaveBeenCalled()
  })

  it('runs the steps from TAIA_QA_STEPS when the caller passes none', async () => {
    delete process.env.TAIA_ALLOW_REMOTE_COMMANDS
    process.env.TAIA_QA_STEPS = JSON.stringify([{ id: 'echo', command: 'echo from-env' }])

    const run = await runQaPipeline({ workspace_id: 'ws-1', task_id: 'task-1' })

    expect(run.steps).toHaveLength(1)
    expect(run.steps[0]).toMatchObject({ id: 'echo', status: 'passed' })
    expect(run.steps[0].stdout_preview).toContain('from-env')
  })

  it('executes QA steps in the active worktree and persists logs/artifacts', async () => {
    const run = await runQaPipeline({
      workspace_id: 'ws-1',
      task_id: 'task-1',
      created_by: 'test-cron',
      steps: [{ id: 'pwd', name: 'Print cwd', command: 'pwd' }],
    })

    expect(run).toMatchObject({
      workspace_id: 'ws-1',
      task_id: 'task-1',
      worktree_id: 'wt-1',
      status: 'passed',
    })
    expect(run.steps).toHaveLength(1)
    expect(run.steps[0]).toMatchObject({ id: 'pwd', status: 'passed', exit_code: 0 })
    expect(run.steps[0].stdout_preview.trim()).toContain(tempDir.replace(/^\/private/, ''))
    await expect(readFile(run.steps[0].log_path, 'utf8')).resolves.toContain(`cwd: ${tempDir}`)
    await expect(readFile(join(run.artifact_dir, 'run.json'), 'utf8')).resolves.toContain(
      '"status": "passed"',
    )
    expect(mockSetSetting).toHaveBeenCalledWith(
      'qaPipeline.runs.ws-1',
      expect.stringContaining(run.id),
    )
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'qa_pipeline_run',
        agent_id: 'test-cron',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        message: expect.stringContaining('passed'),
      }),
    )
  })

  it('marks a run failed and skips later steps after command failure', async () => {
    const run = await runQaPipeline({
      workspace_id: 'ws-1',
      task_id: 'task-1',
      steps: [
        { id: 'fail', command: 'exit 7' },
        { id: 'later', command: 'pwd' },
      ],
    })

    expect(run.status).toBe('failed')
    expect(run.steps.map((step) => step.status)).toEqual(['failed', 'skipped'])
    expect(run.steps[0].exit_code).toBe(7)
    await expect(readFile(run.steps[1].log_path, 'utf8')).resolves.toContain('SKIPPED')
  })

  it('lists persisted runs by workspace and optional task', async () => {
    mockGetSetting.mockResolvedValue(
      JSON.stringify([
        { id: 'run-1', workspace_id: 'ws-1', task_id: 'task-1' },
        { id: 'run-2', workspace_id: 'ws-1', task_id: 'task-2' },
      ]),
    )

    await expect(listQaPipelineRuns('ws-1', 'task-1')).resolves.toEqual([
      { id: 'run-1', workspace_id: 'ws-1', task_id: 'task-1' },
    ])
  })
})
