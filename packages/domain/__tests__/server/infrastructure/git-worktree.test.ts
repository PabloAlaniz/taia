import { describe, it, expect } from 'vitest'
import {
  validateBranchName,
  validatePath,
  generateBranchName,
  parseNumstat,
  parseGitLog,
  getRepoClonePath,
} from '@taia/domain/infrastructure/git-worktree'

// We only test pure functions here — git/spawn operations are tested via integration tests

describe('validateBranchName', () => {
  it('accepts valid branch names', () => {
    expect(validateBranchName('main')).toBe(true)
    expect(validateBranchName('feature/my-feature')).toBe(true)
    expect(validateBranchName('agent/agent-1/task-12345678')).toBe(true)
    expect(validateBranchName('release-1.0.0')).toBe(true)
    expect(validateBranchName('v2.0')).toBe(true)
  })

  it('rejects empty names', () => {
    expect(validateBranchName('')).toBe(false)
  })

  it('rejects names with ..', () => {
    expect(validateBranchName('feature/../main')).toBe(false)
  })

  it('rejects names ending with .lock', () => {
    expect(validateBranchName('branch.lock')).toBe(false)
  })

  it('rejects names ending with /', () => {
    expect(validateBranchName('feature/')).toBe(false)
  })

  it('rejects names ending with .', () => {
    expect(validateBranchName('feature.')).toBe(false)
  })

  it('rejects names starting with special chars', () => {
    expect(validateBranchName('.hidden')).toBe(false)
    expect(validateBranchName('-dashed')).toBe(false)
  })

  it('rejects overly long names', () => {
    expect(validateBranchName('a'.repeat(201))).toBe(false)
  })
})

describe('validatePath', () => {
  it('accepts paths within base', () => {
    expect(validatePath('/tmp/taia-worktrees/abc', '/tmp/taia-worktrees')).toBe(true)
  })

  it('rejects path traversal', () => {
    expect(validatePath('/tmp/taia-worktrees/../etc/passwd', '/tmp/taia-worktrees')).toBe(false)
  })

  it('accepts exact base path', () => {
    expect(validatePath('/tmp/taia-worktrees', '/tmp/taia-worktrees')).toBe(true)
  })

  it('rejects paths outside base', () => {
    expect(validatePath('/var/data', '/tmp/taia-worktrees')).toBe(false)
  })
})

describe('generateBranchName', () => {
  it('generates correct format', () => {
    const name = generateBranchName('agent-1', '1234567890-abcdef')
    expect(name).toBe('agent/agent-1/task-0-abcdef')
  })

  it('uses last 8 chars of taskId', () => {
    const name = generateBranchName('agent-5', 'task-12345678')
    expect(name).toBe('agent/agent-5/task-12345678')
  })
})

describe('parseNumstat', () => {
  it('parses standard numstat output', () => {
    const input = `10\t5\tsrc/index.ts
3\t0\tsrc/new-file.ts
0\t8\tsrc/deleted.ts`

    const files = parseNumstat(input)
    expect(files).toHaveLength(3)
    expect(files[0]).toEqual({
      path: 'src/index.ts',
      insertions: 10,
      deletions: 5,
      status: 'modified',
    })
    expect(files[1]).toEqual({
      path: 'src/new-file.ts',
      insertions: 3,
      deletions: 0,
      status: 'added',
    })
    expect(files[2]).toEqual({
      path: 'src/deleted.ts',
      insertions: 0,
      deletions: 8,
      status: 'deleted',
    })
  })

  it('handles empty input', () => {
    expect(parseNumstat('')).toEqual([])
    expect(parseNumstat('\n')).toEqual([])
  })

  it('handles binary files (- - notation)', () => {
    const input = `-\t-\timage.png`
    const files = parseNumstat(input)
    expect(files).toHaveLength(1)
    expect(files[0].insertions).toBe(0)
    expect(files[0].deletions).toBe(0)
  })
})

describe('parseGitLog', () => {
  it('parses log output', () => {
    const input = `abc1234567890|John Doe|2024-01-15T10:00:00Z|Initial commit
def5678901234|Jane Smith|2024-01-16T11:00:00Z|Add feature`

    const commits = parseGitLog(input)
    expect(commits).toHaveLength(2)
    expect(commits[0]).toEqual({
      hash: 'abc1234567890',
      short_hash: 'abc1234',
      message: 'Initial commit',
      author: 'John Doe',
      date: '2024-01-15T10:00:00Z',
    })
  })

  it('handles empty input', () => {
    expect(parseGitLog('')).toEqual([])
  })

  it('handles commit messages with pipes', () => {
    const input = `abc1234567890|Author|2024-01-15T10:00:00Z|Fix: a|b|c`
    const commits = parseGitLog(input)
    expect(commits[0].message).toBe('Fix: a|b|c')
  })
})

describe('getRepoClonePath', () => {
  it('sanitizes URL to path', () => {
    const result = getRepoClonePath('/tmp/repos', 'https://github.com/org/repo.git')
    expect(result).toContain('/tmp/repos/')
    expect(result).not.toContain('://')
    expect(result).not.toContain('.git')
  })

  it('produces deterministic paths', () => {
    const a = getRepoClonePath('/tmp/repos', 'https://github.com/org/repo.git')
    const b = getRepoClonePath('/tmp/repos', 'https://github.com/org/repo.git')
    expect(a).toBe(b)
  })

  it('different URLs produce different paths', () => {
    const a = getRepoClonePath('/tmp/repos', 'https://github.com/org/repo-a.git')
    const b = getRepoClonePath('/tmp/repos', 'https://github.com/org/repo-b.git')
    expect(a).not.toBe(b)
  })
})
