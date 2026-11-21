import type { Task, TaskPriority, TaskStatus } from '@taia/types'
import { deleteSetting, getSetting, setSetting } from '../db'
import { createTaskWithBroadcast, listTasks, updateTaskWithBroadcast } from './task.service'

export interface GitHubIssueInput {
  number: number
  title: string
  body?: string | null
  html_url: string
  state?: 'open' | 'closed' | string
  labels?: Array<string | { name?: string | null }>
  assignees?: Array<string | { login?: string | null }>
  milestone?: string | { title?: string | null } | null
  updated_at?: string | null
}

export interface GitHubImportRepositoryInput {
  owner: string
  name: string
  url?: string
}

export interface GitHubImportOptions {
  workspace_id: string
  repository: GitHubImportRepositoryInput
  issues: GitHubIssueInput[]
  dryRun?: boolean
  created_by?: string
  project?: string
  project_id?: string
  default_status?: TaskStatus
  default_priority?: TaskPriority
}

export interface GitHubIncrementalSyncOptions extends GitHubImportOptions {
  /** Cursor from the previous successful import run. If omitted, the stored cursor is used. */
  cursor?: string | null
  /** Maximum number of attempts for the write phase. Defaults to 1. */
  maxAttempts?: number
  /** Lock TTL in milliseconds for overlap protection. Defaults to 15 minutes. */
  lockTtlMs?: number
}

export type GitHubImportOperationType = 'create' | 'update' | 'unchanged'

export interface GitHubImportOperation {
  action: GitHubImportOperationType
  issue_number: number
  origin_tag: string
  task_id?: string
  title: string
  changes: string[]
}

export interface GitHubImportResult {
  dryRun: boolean
  workspace_id: string
  repository: GitHubImportRepositoryInput
  created: number
  updated: number
  unchanged: number
  operations: GitHubImportOperation[]
}

export interface GitHubIncrementalDiagnostic {
  workspace_id: string
  repository: string
  cursor_before: string | null
  cursor_after: string | null
  supplied_issues: number
  considered_issues: number
  skipped_by_cursor: number
  attempts: number
  lock_key: string
  started_at: string
  finished_at: string
  duration_ms: number
  error?: string
}

export interface GitHubIncrementalSyncResult extends GitHubImportResult {
  cursor_before: string | null
  cursor_after: string | null
  skipped_by_cursor: number
  attempts: number
  diagnostic: GitHubIncrementalDiagnostic
}

// No status unless the caller picks one: new tasks then land in the
// workspace's initial column (task.service).
type PlannedTask = Pick<
  Task,
  'title' | 'description' | 'repo_url' | 'tags' | 'project' | 'project_id' | 'priority'
> & { status?: Task['status'] }

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '-')
}

function labelsFor(issue: GitHubIssueInput): string[] {
  return (issue.labels || [])
    .map((label) => (typeof label === 'string' ? label : label.name || ''))
    .map(normalizeLabel)
    .filter(Boolean)
}

export function githubOriginTag(
  repository: GitHubImportRepositoryInput,
  issueNumber: number,
): string {
  return `github:${repository.owner}/${repository.name}#${issueNumber}`
}

function repositoryTag(repository: GitHubImportRepositoryInput): string {
  return `github-repo:${repository.owner}/${repository.name}`
}

function repositorySlug(repository: GitHubImportRepositoryInput): string {
  return `${repository.owner}/${repository.name}`
}

function safeRepositoryKey(repository: GitHubImportRepositoryInput): string {
  return repositorySlug(repository)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
}

function githubImportStateKey(
  workspaceId: string,
  repository: GitHubImportRepositoryInput,
  suffix: 'cursor' | 'lock' | 'diagnostic',
): string {
  return `github-import:${workspaceId}:${safeRepositoryKey(repository)}:${suffix}`
}

function validTimestamp(value?: string | null): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function maxIssueUpdatedAt(issues: GitHubIssueInput[], fallback: string | null): string | null {
  let max = validTimestamp(fallback)
  let maxValue = fallback
  for (const issue of issues) {
    const time = validTimestamp(issue.updated_at)
    if (time !== null && (max === null || time > max)) {
      max = time
      maxValue = issue.updated_at || null
    }
  }
  return maxValue
}

function buildDescription(
  issue: GitHubIssueInput,
  repository: GitHubImportRepositoryInput,
): string {
  const body = issue.body?.trim() || '_Sin descripción en GitHub._'
  const milestone =
    typeof issue.milestone === 'string' ? issue.milestone : issue.milestone?.title || undefined
  const assignees = (issue.assignees || [])
    .map((assignee) => (typeof assignee === 'string' ? assignee : assignee.login || ''))
    .filter(Boolean)

  const metadata = [
    '',
    '---',
    `GitHub: ${issue.html_url}`,
    `Origen: ${repository.owner}/${repository.name}#${issue.number}`,
    issue.updated_at ? `GitHub updated_at: ${issue.updated_at}` : undefined,
    milestone ? `Milestone: ${milestone}` : undefined,
    assignees.length > 0 ? `GitHub assignees: ${assignees.join(', ')}` : undefined,
  ].filter(Boolean)

  return `${body}\n${metadata.join('\n')}`
}

function plannedTaskForIssue(options: GitHubImportOptions, issue: GitHubIssueInput): PlannedTask {
  return {
    title: issue.title.trim(),
    description: buildDescription(issue, options.repository),
    repo_url: options.repository.url || issue.html_url.replace(/\/issues\/\d+$/, ''),
    tags: [
      'github-import',
      'source:github',
      repositoryTag(options.repository),
      githubOriginTag(options.repository, issue.number),
      ...labelsFor(issue),
    ],
    project: options.project,
    project_id: options.project_id,
    ...(options.default_status ? { status: options.default_status } : {}),
    priority: options.default_priority || 'MEDIUM',
  }
}

function findExistingByOrigin(existingTasks: Task[], originTag: string): Task | undefined {
  return existingTasks.find((task) => task.tags?.includes(originTag))
}

function arraysEqual(a: string[] = [], b: string[] = []): boolean {
  const left = [...a].sort()
  const right = [...b].sort()
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function diffTask(existing: Task, planned: PlannedTask): string[] {
  const changes: string[] = []
  if (existing.title !== planned.title) changes.push('title')
  if ((existing.description || '') !== (planned.description || '')) changes.push('description')
  if ((existing.repo_url || '') !== (planned.repo_url || '')) changes.push('repo_url')
  if (!arraysEqual(existing.tags || [], planned.tags || [])) changes.push('tags')
  if (planned.project && existing.project !== planned.project) changes.push('project')
  if (planned.project_id && existing.project_id !== planned.project_id) changes.push('project_id')
  return changes
}

export function planGitHubIssueSync(
  existingTasks: Task[],
  options: GitHubImportOptions,
): { operations: GitHubImportOperation[]; plannedByIssue: Map<number, PlannedTask> } {
  const plannedByIssue = new Map<number, PlannedTask>()
  const operations = options.issues.map((issue) => {
    const originTag = githubOriginTag(options.repository, issue.number)
    const planned = plannedTaskForIssue(options, issue)
    plannedByIssue.set(issue.number, planned)
    const existing = findExistingByOrigin(existingTasks, originTag)
    if (!existing) {
      return {
        action: 'create' as const,
        issue_number: issue.number,
        origin_tag: originTag,
        title: planned.title,
        changes: ['new'],
      }
    }

    const changes = diffTask(existing, planned)
    return {
      action: changes.length > 0 ? ('update' as const) : ('unchanged' as const),
      issue_number: issue.number,
      origin_tag: originTag,
      task_id: existing.id,
      title: planned.title,
      changes,
    }
  })

  return { operations, plannedByIssue }
}

export function planIncrementalGitHubIssueSync(
  existingTasks: Task[],
  options: GitHubIncrementalSyncOptions,
): {
  operations: GitHubImportOperation[]
  plannedByIssue: Map<number, PlannedTask>
  consideredIssues: GitHubIssueInput[]
  skippedByCursor: number
  cursor_before: string | null
  cursor_after: string | null
} {
  const cursorBefore = options.cursor || null
  const cursorTime = validTimestamp(cursorBefore)
  const consideredIssues = options.issues.filter((issue) => {
    if (cursorTime === null) return true
    const updatedAt = validTimestamp(issue.updated_at)
    return updatedAt === null || updatedAt > cursorTime
  })
  const planned = planGitHubIssueSync(existingTasks, { ...options, issues: consideredIssues })
  return {
    ...planned,
    consideredIssues,
    skippedByCursor: options.issues.length - consideredIssues.length,
    cursor_before: cursorBefore,
    cursor_after: maxIssueUpdatedAt(consideredIssues, cursorBefore),
  }
}

export async function syncGitHubIssues(options: GitHubImportOptions): Promise<GitHubImportResult> {
  const existing = await listTasks({ workspace_id: options.workspace_id })
  const { operations, plannedByIssue } = planGitHubIssueSync(existing.tasks, options)

  if (!options.dryRun) {
    for (const operation of operations) {
      if (operation.action === 'unchanged') continue
      const planned = plannedByIssue.get(operation.issue_number)!
      if (operation.action === 'create') {
        await createTaskWithBroadcast({
          ...planned,
          workspace_id: options.workspace_id,
          created_by: options.created_by || 'web-ui',
        })
      } else if (operation.action === 'update' && operation.task_id) {
        await updateTaskWithBroadcast(
          operation.task_id,
          {
            title: planned.title,
            description: planned.description,
            repo_url: planned.repo_url,
            tags: planned.tags,
            ...(planned.project ? { project: planned.project } : {}),
            ...(planned.project_id ? { project_id: planned.project_id } : {}),
          },
          options.created_by || 'web-ui',
        )
      }
    }
  }

  return {
    dryRun: Boolean(options.dryRun),
    workspace_id: options.workspace_id,
    repository: options.repository,
    created: operations.filter((op) => op.action === 'create').length,
    updated: operations.filter((op) => op.action === 'update').length,
    unchanged: operations.filter((op) => op.action === 'unchanged').length,
    operations,
  }
}

async function acquireGitHubImportLock(
  workspaceId: string,
  repository: GitHubImportRepositoryInput,
  ttlMs: number,
): Promise<{ acquired: true; key: string } | { acquired: false; key: string; heldUntil?: string }> {
  const key = githubImportStateKey(workspaceId, repository, 'lock')
  const now = Date.now()
  const lock = await getSetting(key)
  if (lock) {
    try {
      const parsed = JSON.parse(lock) as { expires_at?: string }
      const expiresAt = validTimestamp(parsed.expires_at)
      if (expiresAt !== null && expiresAt > now) {
        return { acquired: false, key, heldUntil: parsed.expires_at }
      }
    } catch {
      // Corrupt lock values are treated as expired so an operator can recover by re-running.
    }
  }
  await setSetting(
    key,
    JSON.stringify({
      acquired_at: new Date(now).toISOString(),
      expires_at: new Date(now + ttlMs).toISOString(),
    }),
  )
  return { acquired: true, key }
}

export async function runIncrementalGitHubIssueSync(
  options: GitHubIncrementalSyncOptions,
): Promise<GitHubIncrementalSyncResult> {
  const started = Date.now()
  const startedAt = new Date(started).toISOString()
  const maxAttempts = Math.max(1, options.maxAttempts || 1)
  const cursorKey = githubImportStateKey(options.workspace_id, options.repository, 'cursor')
  const diagnosticKey = githubImportStateKey(options.workspace_id, options.repository, 'diagnostic')
  const lock = await acquireGitHubImportLock(
    options.workspace_id,
    options.repository,
    options.lockTtlMs || 15 * 60 * 1000,
  )
  if (!lock.acquired) {
    const finishedAt = new Date().toISOString()
    const diagnostic: GitHubIncrementalDiagnostic = {
      workspace_id: options.workspace_id,
      repository: repositorySlug(options.repository),
      cursor_before: null,
      cursor_after: null,
      supplied_issues: options.issues.length,
      considered_issues: 0,
      skipped_by_cursor: 0,
      attempts: 0,
      lock_key: lock.key,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: Date.now() - started,
      error: `GitHub import already running until ${'heldUntil' in lock ? lock.heldUntil || 'unknown' : 'unknown'}`,
    }
    await setSetting(diagnosticKey, JSON.stringify(diagnostic))
    throw new Error(diagnostic.error)
  }

  const cursorBefore = options.cursor ?? (await getSetting(cursorKey))
  let attempts = 0
  let lastError: unknown

  try {
    const existing = await listTasks({ workspace_id: options.workspace_id })
    const planned = planIncrementalGitHubIssueSync(existing.tasks, {
      ...options,
      cursor: cursorBefore,
    })

    while (attempts < maxAttempts) {
      attempts += 1
      try {
        const result = await syncGitHubIssues({ ...options, issues: planned.consideredIssues })
        if (!options.dryRun && planned.cursor_after) {
          await setSetting(cursorKey, planned.cursor_after)
        }
        const finishedAt = new Date().toISOString()
        const diagnostic: GitHubIncrementalDiagnostic = {
          workspace_id: options.workspace_id,
          repository: repositorySlug(options.repository),
          cursor_before: planned.cursor_before,
          cursor_after: planned.cursor_after,
          supplied_issues: options.issues.length,
          considered_issues: planned.consideredIssues.length,
          skipped_by_cursor: planned.skippedByCursor,
          attempts,
          lock_key: lock.key,
          started_at: startedAt,
          finished_at: finishedAt,
          duration_ms: Date.now() - started,
        }
        await setSetting(diagnosticKey, JSON.stringify(diagnostic))
        return {
          ...result,
          cursor_before: planned.cursor_before,
          cursor_after: planned.cursor_after,
          skipped_by_cursor: planned.skippedByCursor,
          attempts,
          diagnostic,
        }
      } catch (error) {
        lastError = error
        if (attempts >= maxAttempts) break
      }
    }

    const finishedAt = new Date().toISOString()
    const diagnostic: GitHubIncrementalDiagnostic = {
      workspace_id: options.workspace_id,
      repository: repositorySlug(options.repository),
      cursor_before: planned.cursor_before,
      cursor_after: planned.cursor_after,
      supplied_issues: options.issues.length,
      considered_issues: planned.consideredIssues.length,
      skipped_by_cursor: planned.skippedByCursor,
      attempts,
      lock_key: lock.key,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: Date.now() - started,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    }
    await setSetting(diagnosticKey, JSON.stringify(diagnostic))
    throw lastError
  } finally {
    await deleteSetting(lock.key)
  }
}
