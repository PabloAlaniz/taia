// Worktree service — orchestrates DB + infrastructure for git worktree lifecycle
//
// Uses lazy import() for server/infrastructure/git-worktree.ts to prevent
// child_process leaking into lib/ module graph at import time.

import {
  getWorktreeById,
  getActiveWorktreeForTask,
  getAllActiveWorktrees,
  createWorktreeRecord,
  updateWorktreeStatus,
} from '../db/index'
import { getTaskById } from '../db/repositories/task.repository'
import { getRepositoryById, getPrimaryRepository } from '../db/repositories/repository.repository'
import { broadcastWorktreeUpdate } from '../broadcast'
import { logWorktreeCreated, logWorktreeMerged, logWorktreeFailed } from './activity.service'
import { getWorktreeConfig } from './worktree-config'
import { AppError, NotFoundError } from '../errors'
import type { Worktree, DiffResult, MergeStrategy } from '@taia/types'

// Lazy-load infrastructure to keep child_process out of lib/ imports
async function getInfra() {
  return import('@taia/domain/infrastructure/git-worktree')
}

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

export async function createWorktree(data: {
  task_id: string
  repository_id?: string
  base_branch?: string
  merge_strategy?: MergeStrategy
  created_by?: string
}): Promise<Worktree> {
  const infra = await getInfra()

  // Validate task exists
  const task = await getTaskById(data.task_id)
  if (!task) throw new NotFoundError('Task', data.task_id)

  // Check no active worktree for this task
  const existing = await getActiveWorktreeForTask(data.task_id)
  if (existing) {
    throw new AppError('Task already has an active worktree', 409, 'WORKTREE_EXISTS')
  }

  // Resolve repository
  let repoId = data.repository_id
  let repoUrl: string | undefined

  if (repoId) {
    const repo = await getRepositoryById(repoId)
    if (!repo) throw new NotFoundError('Repository', repoId)
    repoUrl = repo.url
  } else if (task.repo_url) {
    // Try to find repo by URL in project
    if (task.project_id) {
      const primaryRepo = await getPrimaryRepository(task.project_id)
      if (primaryRepo) {
        repoId = primaryRepo.id
        repoUrl = primaryRepo.url
      }
    }
    if (!repoId) {
      throw new AppError(
        'No repository found for task. Provide repository_id.',
        400,
        'NO_REPOSITORY',
      )
    }
  } else if (task.primary_repo_url && task.project_id) {
    const primaryRepo = await getPrimaryRepository(task.project_id)
    if (primaryRepo) {
      repoId = primaryRepo.id
      repoUrl = primaryRepo.url
    }
    if (!repoId) {
      throw new AppError(
        'No repository found for task. Provide repository_id.',
        400,
        'NO_REPOSITORY',
      )
    }
  } else {
    throw new AppError('Task has no associated repository', 400, 'NO_REPOSITORY')
  }

  // Generate branch name
  const agentId = data.created_by || task.assigned_to || 'unknown'
  const branchName = infra.generateBranchName(agentId, task.id)

  if (!infra.validateBranchName(branchName)) {
    throw new AppError(`Invalid branch name: ${branchName}`, 400, 'INVALID_BRANCH')
  }

  // Create DB record (status: creating)
  const worktree = await createWorktreeRecord({
    task_id: data.task_id,
    repository_id: repoId!,
    branch_name: branchName,
    base_branch: data.base_branch || 'main',
    merge_strategy: data.merge_strategy || 'squash',
    created_by: data.created_by,
  })

  try {
    const wtConfig = await getWorktreeConfig()

    // Clone/fetch repo
    const clonePath = infra.getRepoClonePath(wtConfig.repoClonePath, repoUrl!)
    await infra.cloneIfNeeded(repoUrl!, clonePath)

    // Create worktree
    const worktreePath = `${wtConfig.basePath}/${worktree.id}`
    await infra.createWorktree({
      repoPath: clonePath,
      worktreePath,
      branchName,
      baseBranch: data.base_branch || 'main',
    })

    // Run setup command
    if (wtConfig.setupCommand) {
      await infra.runSetupCommand(worktreePath, wtConfig.setupCommand)
    }

    // Update to active
    const updated = await updateWorktreeStatus(worktree.id, 'active', {
      worktree_path: worktreePath,
    })

    // Log + broadcast
    await logWorktreeCreated(data.task_id, branchName, data.created_by || 'system')
    broadcastWorktreeUpdate(worktree.id, 'created', updated)

    return updated!
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updateWorktreeStatus(worktree.id, 'failed', { error_message: message })
    await logWorktreeFailed(data.task_id, branchName, message)
    throw new AppError(`Failed to create worktree: ${message}`, 500, 'WORKTREE_CREATE_FAILED')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff
// ─────────────────────────────────────────────────────────────────────────────

export async function getWorktreeDiff(worktreeId: string): Promise<DiffResult> {
  const infra = await getInfra()

  const wt = await getWorktreeById(worktreeId)
  if (!wt) throw new NotFoundError('Worktree', worktreeId)

  const repo = await getRepositoryById(wt.repository_id)
  if (!repo) throw new NotFoundError('Repository', wt.repository_id)

  const wtConfig = await getWorktreeConfig()
  const clonePath = infra.getRepoClonePath(wtConfig.repoClonePath, repo.url)

  const result = await infra.getWorktreeDiff(clonePath, wt.branch_name, wt.base_branch)

  // Cache stats in DB
  await updateWorktreeStatus(wt.id, wt.status, { diff_stats: result.stats })

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Review
// ─────────────────────────────────────────────────────────────────────────────

export async function startReview(worktreeId: string): Promise<Worktree> {
  const wt = await getWorktreeById(worktreeId)
  if (!wt) throw new NotFoundError('Worktree', worktreeId)

  if (wt.status !== 'active') {
    throw new AppError(`Cannot review worktree in status '${wt.status}'`, 400, 'INVALID_STATUS')
  }

  const updated = await updateWorktreeStatus(worktreeId, 'reviewing')
  broadcastWorktreeUpdate(worktreeId, 'updated', updated)
  return updated!
}

// ─────────────────────────────────────────────────────────────────────────────
// Merge
// ─────────────────────────────────────────────────────────────────────────────

export async function mergeWorktree(
  worktreeId: string,
  opts?: { strategy?: MergeStrategy },
): Promise<Worktree> {
  const infra = await getInfra()

  const wt = await getWorktreeById(worktreeId)
  if (!wt) throw new NotFoundError('Worktree', worktreeId)

  if (!['active', 'reviewing'].includes(wt.status)) {
    throw new AppError(`Cannot merge worktree in status '${wt.status}'`, 400, 'INVALID_STATUS')
  }

  const repo = await getRepositoryById(wt.repository_id)
  if (!repo) throw new NotFoundError('Repository', wt.repository_id)

  const wtConfig = await getWorktreeConfig()
  const clonePath = infra.getRepoClonePath(wtConfig.repoClonePath, repo.url)
  const strategy = opts?.strategy || wt.merge_strategy

  // Update to merging
  await updateWorktreeStatus(worktreeId, 'merging')

  try {
    await infra.mergeWorktree(clonePath, wt.branch_name, wt.base_branch, strategy)

    const updated = await updateWorktreeStatus(worktreeId, 'merged')

    // Auto-cleanup
    if (wtConfig.autoCleanup && wt.worktree_path) {
      try {
        await infra.removeWorktree(clonePath, wt.worktree_path, wt.branch_name, true)
      } catch {
        // Non-fatal cleanup error
      }
    }

    await logWorktreeMerged(wt.task_id, wt.branch_name, strategy)
    broadcastWorktreeUpdate(worktreeId, 'merged', updated)

    return updated!
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updateWorktreeStatus(worktreeId, 'failed', { error_message: message })
    await logWorktreeFailed(wt.task_id, wt.branch_name, message)
    throw new AppError(`Merge failed: ${message}`, 500, 'MERGE_FAILED')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

export async function cleanupWorktree(worktreeId: string): Promise<void> {
  const infra = await getInfra()

  const wt = await getWorktreeById(worktreeId)
  if (!wt) throw new NotFoundError('Worktree', worktreeId)

  const repo = await getRepositoryById(wt.repository_id)
  if (repo && wt.worktree_path) {
    const wtConfig = await getWorktreeConfig()
    const clonePath = infra.getRepoClonePath(wtConfig.repoClonePath, repo.url)
    try {
      await infra.removeWorktree(clonePath, wt.worktree_path, wt.branch_name, true)
    } catch {
      // Non-fatal
    }
  }

  await updateWorktreeStatus(worktreeId, 'cleanup')
}

export async function abortWorktree(worktreeId: string): Promise<Worktree> {
  const wt = await getWorktreeById(worktreeId)
  if (!wt) throw new NotFoundError('Worktree', worktreeId)

  await cleanupWorktree(worktreeId)
  const updated = await updateWorktreeStatus(worktreeId, 'failed', {
    error_message: 'Aborted by user',
  })
  broadcastWorktreeUpdate(worktreeId, 'updated', updated)
  return updated!
}

// ─────────────────────────────────────────────────────────────────────────────
// Stale cleanup
// ─────────────────────────────────────────────────────────────────────────────

export async function cleanupStaleWorktrees(): Promise<number> {
  const activeWorktrees = await getAllActiveWorktrees()
  const wtConfig = await getWorktreeConfig()
  const cutoff = Date.now() - wtConfig.cleanupAfterHours * 3600_000
  let cleaned = 0

  for (const wt of activeWorktrees) {
    const createdAt = new Date(wt.created_at).getTime()
    if (createdAt < cutoff) {
      try {
        await cleanupWorktree(wt.id)
        cleaned++
      } catch {
        // Continue with others
      }
    }
  }

  return cleaned
}

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers (re-export from repo for service-level access)
// ─────────────────────────────────────────────────────────────────────────────

export { getWorktreeById, getWorktreesForTask, getActiveWorktreeForTask } from '../db/index'
