// Command policy — which programs the server may run on behalf of a request.
// Access to the API is all or nothing (an optional shared token, no users or
// roles), so nothing reachable over HTTP may choose a
// program to execute: that would let any caller run code on the server.
//
// CLI runtimes (Claude Code, Aider, Cursor) may spawn either
//   - the operator's choice, from `TAIA_CLI_COMMAND_<PROVIDER>` (e.g.
//     `TAIA_CLI_COMMAND_CLAUDE_CODE=/opt/bin/claude`), which always wins, or
//   - one of the provider's own binaries (`commands` in @taia/runtime/providers,
//     e.g. `claude`, `aider`, `cursor-agent`), bare or as an absolute path
//     ending in it.
// The working directory can be pinned the same way with `TAIA_CLI_CWD`.
//
// Free-form shell commands (QA pipeline steps, the worktree setup command)
// come from the server environment only. `TAIA_ALLOW_REMOTE_COMMANDS=1`
// lets the API and settings set them again, for trusted single-user setups.
//
// The same goes for the directories the server clones repositories and
// creates worktrees in (`WORKTREE_BASE_PATH`, `WORKTREE_REPO_PATH`): a caller
// who could choose them would make the server write wherever its user can.

import { basename, isAbsolute } from 'path'
import { findRuntimeProvider, type RuntimeProviderName } from '@taia/runtime'

export interface CliCommandResolution {
  /** The command to run, or null when none is set or it is not allowed. */
  command: string | null
  /** The requested command was refused by the policy. */
  rejected: boolean
}

export function cliCommandEnvKey(provider: RuntimeProviderName): string {
  return `TAIA_CLI_COMMAND_${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
}

function envValue(key: string): string | null {
  return process.env[key]?.trim() || null
}

/** The binary `provider` may run, given the `requested` one from settings. */
export function resolveCliCommand(
  provider: RuntimeProviderName,
  requested: string | null | undefined,
): CliCommandResolution {
  const fromEnv = envValue(cliCommandEnvKey(provider))
  if (fromEnv) return { command: fromEnv, rejected: false }

  const wanted = requested?.trim() || null
  if (!wanted) return { command: null, rejected: false }

  const binaries = findRuntimeProvider(provider)?.commands ?? []
  const name = isAbsolute(wanted) ? basename(wanted) : wanted
  const allowed = binaries.includes(name)
  return allowed ? { command: wanted, rejected: false } : { command: null, rejected: true }
}

/** The working directory for CLI sessions: `TAIA_CLI_CWD` wins over settings. */
export function resolveCliCwd(requested: string | null | undefined): string | null {
  return envValue('TAIA_CLI_CWD') ?? (requested?.trim() || null)
}

/** Whether the API and settings may set free-form commands the server runs. */
export function remoteCommandsAllowed(): boolean {
  return process.env.TAIA_ALLOW_REMOTE_COMMANDS === '1'
}

export const REMOTE_COMMANDS_DISABLED_MESSAGE =
  'Commands set through the API are disabled: API access must not be enough to run programs on the server. ' +
  'Configure them in the server environment, or set TAIA_ALLOW_REMOTE_COMMANDS=1 on a trusted host.'

export const REMOTE_PATHS_DISABLED_MESSAGE =
  'Worktree paths set through the API are disabled: API access must not be enough to choose where the server writes. ' +
  'Set WORKTREE_BASE_PATH and WORKTREE_REPO_PATH in the server environment, or ' +
  'TAIA_ALLOW_REMOTE_COMMANDS=1 on a trusted host.'
