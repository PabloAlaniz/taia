// Worktree configuration — DB settings with env var fallback
//
// Priority: DB setting > env var > hardcoded default (the setup command and
// the two paths are env-only unless TAIA_ALLOW_REMOTE_COMMANDS=1)
// Configurable from /settings/worktrees UI

import { getSetting } from '../db/index'
import { config } from '../config'
import { remoteCommandsAllowed } from '../command-policy'

export interface WorktreeConfig {
  basePath: string
  repoClonePath: string
  cleanupAfterHours: number
  setupCommand: string
  autoCleanup: boolean
  autoCreateOnAssign: boolean
}

export async function getWorktreeConfig(): Promise<WorktreeConfig> {
  const [basePath, repoClonePath, cleanupHours, setupCmd, autoCleanup, autoCreate] =
    await Promise.all([
      getSetting('worktree.base_path'),
      getSetting('worktree.repo_clone_path'),
      getSetting('worktree.cleanup_hours'),
      getSetting('worktree.setup_command'),
      getSetting('worktree.auto_cleanup'),
      getSetting('worktree.auto_create_on_assign'),
    ])

  // Where the server writes and what it runs come from the environment
  // unless the operator opted in to setting them from the UI
  // (command-policy.ts).
  const remote = remoteCommandsAllowed()

  return {
    basePath: (remote ? basePath : null) || config.worktree.basePath,
    repoClonePath: (remote ? repoClonePath : null) || config.worktree.repoClonePath,
    cleanupAfterHours: parseInt(cleanupHours || '') || config.worktree.cleanupAfterHours,
    setupCommand: (remote ? setupCmd : null) ?? config.worktree.setupCommand,
    autoCleanup: autoCleanup != null ? autoCleanup !== 'false' : config.worktree.autoCleanup,
    autoCreateOnAssign:
      autoCreate != null ? autoCreate === 'true' : config.worktree.autoCreateOnAssign,
  }
}
