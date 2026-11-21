// Git worktree infrastructure — all child_process/path/fs operations live here
// ONLY file allowed to use child_process/path/fs (hexagonal boundary)

import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import type { DiffStats, DiffFileStat, DiffCommit, DiffResult, MergeStrategy } from '@taia/types'

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const BRANCH_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._\-/]*$/

export function validateBranchName(name: string): boolean {
  if (!name || name.length > 200) return false
  if (!BRANCH_NAME_REGEX.test(name)) return false
  if (name.includes('..')) return false
  if (name.endsWith('.lock')) return false
  if (name.endsWith('/') || name.endsWith('.')) return false
  return true
}

export function validatePath(targetPath: string, basePath: string): boolean {
  const resolved = path.resolve(targetPath)
  const resolvedBase = path.resolve(basePath)
  return resolved.startsWith(resolvedBase + path.sep) || resolved === resolvedBase
}

// ─────────────────────────────────────────────────────────────────────────────
// Git execution — spawn only, never exec
// ─────────────────────────────────────────────────────────────────────────────

export interface GitResult {
  stdout: string
  stderr: string
  exitCode: number
}

export function git(args: string[], cwd: string, timeoutMs = 30_000): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    })

    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []

    proc.stdout.on('data', (data) => chunks.push(data))
    proc.stderr.on('data', (data) => errChunks.push(data))

    proc.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(chunks).toString('utf-8'),
        stderr: Buffer.concat(errChunks).toString('utf-8'),
        exitCode: code ?? 1,
      })
    })

    proc.on('error', (err) => {
      reject(new Error(`git ${args[0]} failed: ${err.message}`))
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch naming
// ─────────────────────────────────────────────────────────────────────────────

export function generateBranchName(agentId: string, taskId: string): string {
  // Use last 8 chars of taskId as short id
  const shortId = taskId.slice(-8)
  return `agent/${agentId}/task-${shortId}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Clone / Fetch
// ─────────────────────────────────────────────────────────────────────────────

// A bare clone maps the remote's branches straight onto refs/heads/* and has
// no fetch refspec, so `origin/<branch>` doesn't exist and later fetches only
// update FETCH_HEAD. Everything below works against `origin/<branch>`, so the
// clone tracks the remote's branches under refs/remotes/origin/*.
const ORIGIN_FETCH_REFSPEC = '+refs/heads/*:refs/remotes/origin/*'

async function fetchOrigin(clonePath: string): Promise<void> {
  let result = await git(['config', 'remote.origin.fetch', ORIGIN_FETCH_REFSPEC], clonePath)
  if (result.exitCode !== 0) {
    throw new Error(`git config failed: ${result.stderr}`)
  }
  result = await git(['fetch', '--all', '--prune'], clonePath, 60_000)
  if (result.exitCode !== 0) {
    throw new Error(`git fetch failed: ${result.stderr}`)
  }
}

export async function cloneIfNeeded(repoUrl: string, clonePath: string): Promise<void> {
  // A bare clone keeps HEAD at its top level (there is no .git directory);
  // also accept a regular clone someone placed there.
  const cloned =
    fs.existsSync(path.join(clonePath, 'HEAD')) || fs.existsSync(path.join(clonePath, '.git'))

  if (!cloned) {
    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(clonePath), { recursive: true })

    const result = await git(
      ['clone', '--bare', repoUrl, clonePath],
      path.dirname(clonePath),
      60_000,
    )
    if (result.exitCode !== 0) {
      throw new Error(`git clone failed: ${result.stderr}`)
    }
  }

  await fetchOrigin(clonePath)
}

// ─────────────────────────────────────────────────────────────────────────────
// Worktree operations
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateWorktreeOpts {
  repoPath: string
  worktreePath: string
  branchName: string
  baseBranch: string
}

export async function createWorktree(opts: CreateWorktreeOpts): Promise<void> {
  const { repoPath, worktreePath, branchName, baseBranch } = opts

  // Ensure parent dir exists
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true })

  const result = await git(
    ['worktree', 'add', '-b', branchName, worktreePath, `origin/${baseBranch}`],
    repoPath,
    60_000,
  )

  if (result.exitCode !== 0) {
    throw new Error(`git worktree add failed: ${result.stderr}`)
  }
}

export interface ParsedWorktree {
  path: string
  head: string
  branch: string
  bare: boolean
}

export async function listWorktrees(repoPath: string): Promise<ParsedWorktree[]> {
  const result = await git(['worktree', 'list', '--porcelain'], repoPath)
  if (result.exitCode !== 0) {
    throw new Error(`git worktree list failed: ${result.stderr}`)
  }

  const entries: ParsedWorktree[] = []
  let current: Partial<ParsedWorktree> = {}

  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) entries.push(current as ParsedWorktree)
      current = { path: line.slice(9), bare: false }
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5)
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7)
    } else if (line === 'bare') {
      current.bare = true
    } else if (line === '' && current.path) {
      entries.push(current as ParsedWorktree)
      current = {}
    }
  }

  if (current.path) entries.push(current as ParsedWorktree)
  return entries
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff
// ─────────────────────────────────────────────────────────────────────────────

export function parseNumstat(output: string): DiffFileStat[] {
  const files: DiffFileStat[] = []
  for (const line of output.trim().split('\n')) {
    if (!line) continue
    const [ins, del, filePath] = line.split('\t')
    if (!filePath) continue

    const insertions = ins === '-' ? 0 : parseInt(ins) || 0
    const deletions = del === '-' ? 0 : parseInt(del) || 0

    let status: DiffFileStat['status'] = 'modified'
    if (insertions > 0 && deletions === 0) status = 'added'
    if (insertions === 0 && deletions > 0) status = 'deleted'

    files.push({ path: filePath, insertions, deletions, status })
  }
  return files
}

export function parseGitLog(output: string): DiffCommit[] {
  const commits: DiffCommit[] = []
  for (const line of output.trim().split('\n')) {
    if (!line) continue
    const [hash, author, date, ...messageParts] = line.split('|')
    if (!hash) continue
    commits.push({
      hash: hash.trim(),
      short_hash: hash.trim().slice(0, 7),
      message: messageParts.join('|').trim(),
      author: author?.trim() || '',
      date: date?.trim() || '',
    })
  }
  return commits
}

export async function getWorktreeDiff(
  repoPath: string,
  branchName: string,
  baseBranch: string,
): Promise<DiffResult> {
  // Get numstat
  const numstatResult = await git(
    ['diff', '--numstat', `origin/${baseBranch}...${branchName}`],
    repoPath,
    60_000,
  )
  const files = numstatResult.exitCode === 0 ? parseNumstat(numstatResult.stdout) : []

  // Get unified diff
  const diffResult = await git(['diff', `origin/${baseBranch}...${branchName}`], repoPath, 60_000)
  const unified_diff = diffResult.exitCode === 0 ? diffResult.stdout : ''

  // Get commits
  const logResult = await git(
    ['log', '--format=%H|%an|%aI|%s', `origin/${baseBranch}..${branchName}`],
    repoPath,
  )
  const commits = logResult.exitCode === 0 ? parseGitLog(logResult.stdout) : []

  const stats: DiffStats = {
    files_changed: files.length,
    insertions: files.reduce((sum, f) => sum + f.insertions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    files,
  }

  return { stats, unified_diff, commits }
}

// ─────────────────────────────────────────────────────────────────────────────
// Merge
// ─────────────────────────────────────────────────────────────────────────────

export async function mergeWorktree(
  repoPath: string,
  branchName: string,
  baseBranch: string,
  strategy: MergeStrategy = 'squash',
): Promise<void> {
  // For bare repos, we need a temporary worktree to merge
  // Create a temp worktree for the base branch
  const tempPath = path.join(path.dirname(repoPath), `.taia-merge-${Date.now()}`)

  try {
    // Create temp worktree at base branch
    let result = await git(['worktree', 'add', tempPath, `origin/${baseBranch}`], repoPath)
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create merge worktree: ${result.stderr}`)
    }

    // Create a local base branch if it doesn't exist
    await git(['checkout', '-B', baseBranch, `origin/${baseBranch}`], tempPath)

    // Pull latest
    result = await git(['pull', 'origin', baseBranch], tempPath)

    // Merge based on strategy
    if (strategy === 'squash') {
      result = await git(['merge', '--squash', branchName], tempPath)
      if (result.exitCode !== 0) {
        throw new Error(`Squash merge failed: ${result.stderr}`)
      }
      result = await git(['commit', '-m', `Squash merge ${branchName}`], tempPath)
    } else if (strategy === 'rebase') {
      result = await git(['rebase', branchName], tempPath)
    } else {
      result = await git(['merge', '--no-ff', branchName, '-m', `Merge ${branchName}`], tempPath)
    }

    if (result.exitCode !== 0) {
      throw new Error(`Merge (${strategy}) failed: ${result.stderr}`)
    }

    // Push merged base branch
    result = await git(['push', 'origin', baseBranch], tempPath, 60_000)
    if (result.exitCode !== 0) {
      throw new Error(`Push after merge failed: ${result.stderr}`)
    }
  } finally {
    // Cleanup temp worktree
    await git(['worktree', 'remove', '--force', tempPath], repoPath).catch(() => {})
    // Remove directory if still exists
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { recursive: true, force: true })
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Remove
// ─────────────────────────────────────────────────────────────────────────────

export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  branchName: string,
  force = false,
): Promise<void> {
  // Remove the worktree
  const args = ['worktree', 'remove']
  if (force) args.push('--force')
  args.push(worktreePath)

  await git(args, repoPath)

  // Prune stale entries
  await git(['worktree', 'prune'], repoPath)

  // Delete the branch
  const delArgs = ['branch', force ? '-D' : '-d', branchName]
  await git(delArgs, repoPath)
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup command
// ─────────────────────────────────────────────────────────────────────────────

export async function runSetupCommand(worktreePath: string, command: string): Promise<void> {
  if (!command) return

  // Split safely — only simple commands supported
  const [cmd, ...args] = command.split(/\s+/)
  if (!cmd) return

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: worktreePath,
      stdio: 'ignore',
      timeout: 120_000,
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Setup command exited with code ${code}`))
      } else {
        resolve()
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Setup command failed: ${err.message}`))
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getRepoClonePath(repoCloneBase: string, repoUrl: string): string {
  // Derive a deterministic clone path from repo URL
  const sanitized = repoUrl
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(repoCloneBase, sanitized)
}
