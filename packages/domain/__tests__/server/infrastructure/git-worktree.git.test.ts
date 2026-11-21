import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  cloneIfNeeded,
  createWorktree,
  getWorktreeDiff,
  git,
  listWorktrees,
  mergeWorktree,
  removeWorktree,
  runSetupCommand,
} from '@taia/domain/infrastructure/git-worktree'

// These run the real `git` binary against throwaway repositories in a temp
// directory: an "upstream" bare repo plays the remote, and the code under test
// clones it the same way the worktree service does.

const IDENTITY = {
  GIT_AUTHOR_NAME: 'TAIA Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'TAIA Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  // Ignore the developer's own git config (signing, hooks, default branch).
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
}

let root: string
let upstream: string
let clonePath: string
let worktreesDir: string
const savedEnv: Record<string, string | undefined> = {}

async function run(args: string[], cwd: string): Promise<string> {
  const result = await git(args, cwd)
  if (result.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}

async function commitFile(cwd: string, file: string, content: string, message: string) {
  fs.writeFileSync(path.join(cwd, file), content)
  await run(['add', file], cwd)
  await run(['commit', '-m', message], cwd)
}

/** Push a new commit to upstream `main` from a scratch checkout. */
async function pushToUpstream(file: string, content: string, message: string) {
  const scratch = fs.mkdtempSync(path.join(root, 'scratch-'))
  await run(['clone', upstream, scratch], root)
  await commitFile(scratch, file, content, message)
  await run(['push', 'origin', 'main'], scratch)
}

beforeAll(() => {
  for (const [key, value] of Object.entries(IDENTITY)) {
    savedEnv[key] = process.env[key]
    process.env[key] = value
  }
})

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'taia-git-'))
  upstream = path.join(root, 'upstream.git')
  clonePath = path.join(root, 'clones', 'repo')
  worktreesDir = path.join(root, 'worktrees')

  await run(['init', '--bare', '--initial-branch=main', upstream], root)
  await pushToUpstream('README.md', 'hello\n', 'initial commit')

  return () => fs.rmSync(root, { recursive: true, force: true })
})

async function addWorktree(branchName: string): Promise<string> {
  const worktreePath = path.join(worktreesDir, branchName.replaceAll('/', '-'))
  await createWorktree({ repoPath: clonePath, worktreePath, branchName, baseBranch: 'main' })
  return worktreePath
}

describe('cloneIfNeeded', () => {
  it('clones a bare repository that tracks origin branches', async () => {
    await cloneIfNeeded(upstream, clonePath)

    expect(await run(['rev-parse', '--is-bare-repository'], clonePath)).toBe('true')
    expect(await run(['rev-parse', 'origin/main'], clonePath)).toBe(
      await run(['rev-parse', 'main'], upstream),
    )
  })

  it('fetches new upstream commits when the clone already exists', async () => {
    await cloneIfNeeded(upstream, clonePath)
    await pushToUpstream('second.txt', 'more\n', 'second commit')

    await cloneIfNeeded(upstream, clonePath)

    expect(await run(['rev-parse', 'origin/main'], clonePath)).toBe(
      await run(['rev-parse', 'main'], upstream),
    )
  })

  it('repairs a bare clone made without the origin refspec', async () => {
    fs.mkdirSync(path.dirname(clonePath), { recursive: true })
    await run(['clone', '--bare', upstream, clonePath], root)

    await cloneIfNeeded(upstream, clonePath)

    expect(await run(['rev-parse', '--verify', 'origin/main'], clonePath)).toMatch(/^[0-9a-f]{40}$/)
  })

  it('fails with the git error when the repository does not exist', async () => {
    await expect(cloneIfNeeded(path.join(root, 'missing.git'), clonePath)).rejects.toThrow(
      /git clone failed/,
    )
  })
})

describe('worktree lifecycle', () => {
  beforeEach(async () => {
    await cloneIfNeeded(upstream, clonePath)
  })

  it('creates a worktree on a new branch from the base branch', async () => {
    const worktreePath = await addWorktree('agent/a1/task-1')

    expect(fs.readFileSync(path.join(worktreePath, 'README.md'), 'utf-8')).toBe('hello\n')
    expect(await run(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath)).toBe('agent/a1/task-1')
  })

  it('fails when the base branch does not exist', async () => {
    await expect(
      createWorktree({
        repoPath: clonePath,
        worktreePath: path.join(worktreesDir, 'nope'),
        branchName: 'agent/a1/task-2',
        baseBranch: 'does-not-exist',
      }),
    ).rejects.toThrow(/git worktree add failed/)
  })

  it('lists the bare clone and its worktrees', async () => {
    const worktreePath = await addWorktree('agent/a1/task-3')

    const entries = await listWorktrees(clonePath)

    expect(entries.find((e) => e.bare)?.path).toBe(fs.realpathSync(clonePath))
    const added = entries.find((e) => e.branch === 'refs/heads/agent/a1/task-3')
    expect(added?.path).toBe(fs.realpathSync(worktreePath))
    expect(added?.head).toMatch(/^[0-9a-f]{40}$/)
  })

  it('reports the diff and commits of a branch against its base', async () => {
    const worktreePath = await addWorktree('agent/a1/task-4')
    await commitFile(worktreePath, 'feature.txt', 'one\ntwo\n', 'add feature')

    const diff = await getWorktreeDiff(clonePath, 'agent/a1/task-4', 'main')

    expect(diff.stats).toMatchObject({ files_changed: 1, insertions: 2, deletions: 0 })
    expect(diff.stats.files[0]).toMatchObject({ path: 'feature.txt', status: 'added' })
    expect(diff.unified_diff).toContain('+one')
    expect(diff.commits.map((c) => c.message)).toEqual(['add feature'])
    expect(diff.commits[0].author).toBe('TAIA Test')
  })

  it('reports an empty diff for a branch that does not exist', async () => {
    const diff = await getWorktreeDiff(clonePath, 'no-such-branch', 'main')

    expect(diff).toEqual({
      stats: { files_changed: 0, insertions: 0, deletions: 0, files: [] },
      unified_diff: '',
      commits: [],
    })
  })

  it.each(['squash', 'merge', 'rebase'] as const)(
    'merges a branch into upstream with the %s strategy',
    async (strategy) => {
      const worktreePath = await addWorktree('agent/a1/task-5')
      await commitFile(worktreePath, 'feature.txt', 'done\n', 'add feature')

      await mergeWorktree(clonePath, 'agent/a1/task-5', 'main', strategy)

      expect(await run(['show', 'main:feature.txt'], upstream)).toBe('done')
      const subject = await run(['log', '-1', '--format=%s', 'main'], upstream)
      expect(subject).toBe(
        {
          squash: 'Squash merge agent/a1/task-5',
          merge: 'Merge agent/a1/task-5',
          rebase: 'add feature',
        }[strategy],
      )
      // The temporary merge worktree is cleaned up.
      expect(
        fs.readdirSync(path.dirname(clonePath)).filter((n) => n.startsWith('.taia-merge-')),
      ).toEqual([])
    },
  )

  it('fails and cleans up when the merge conflicts', async () => {
    const worktreePath = await addWorktree('agent/a1/task-6')
    await commitFile(worktreePath, 'README.md', 'from the agent\n', 'agent edit')
    await pushToUpstream('README.md', 'from upstream\n', 'upstream edit')
    await cloneIfNeeded(upstream, clonePath)

    await expect(mergeWorktree(clonePath, 'agent/a1/task-6', 'main', 'merge')).rejects.toThrow(
      /Merge \(merge\) failed/,
    )

    expect(await run(['show', 'main:README.md'], upstream)).toBe('from upstream')
    expect(
      fs.readdirSync(path.dirname(clonePath)).filter((n) => n.startsWith('.taia-merge-')),
    ).toEqual([])
  })

  it('removes a worktree and its branch', async () => {
    const worktreePath = await addWorktree('agent/a1/task-7')
    await commitFile(worktreePath, 'wip.txt', 'wip\n', 'wip')

    await removeWorktree(clonePath, worktreePath, 'agent/a1/task-7', true)

    expect(fs.existsSync(worktreePath)).toBe(false)
    expect(await run(['branch', '--list', 'agent/a1/task-7'], clonePath)).toBe('')
  })
})

describe('git', () => {
  it('returns the exit code and stderr of a failing command', async () => {
    const result = await git(['rev-parse', '--verify', 'nope'], root)

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).not.toBe('')
  })

  it('rejects when the working directory does not exist', async () => {
    await expect(git(['status'], path.join(root, 'missing'))).rejects.toThrow(/git status failed/)
  })
})

describe('runSetupCommand', () => {
  it('does nothing for an empty command', async () => {
    await expect(runSetupCommand(root, '')).resolves.toBeUndefined()
    await expect(runSetupCommand(root, '   ')).resolves.toBeUndefined()
  })

  it('runs the command in the worktree directory', async () => {
    await runSetupCommand(root, 'touch setup-ran')

    expect(fs.existsSync(path.join(root, 'setup-ran'))).toBe(true)
  })

  it('rejects when the command exits with a non-zero code', async () => {
    await expect(runSetupCommand(root, 'false')).rejects.toThrow(/exited with code 1/)
  })

  it('rejects when the command cannot be started', async () => {
    await expect(runSetupCommand(root, 'taia-no-such-binary')).rejects.toThrow(
      /Setup command failed/,
    )
  })
})
