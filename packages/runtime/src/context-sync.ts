// Context sync — contract for runtimes that keep the agent's context as
// native files (capability: ContextSync). The adapter renders the bundle to
// files and pushes them; core stores the returned state and retries.
//
// Justification: docs/adr/005-runtime-owned-context-and-settings.md

import type { AgentContextBundle } from '@taia/types'

/** One file rendered from the bundle, as the runtime stores it. */
export interface ProjectedFile {
  /** Path relative to the agent workspace, e.g. `SOUL.md`. */
  path: string
  content: string
  /** sha256 hex of `content` (UTF-8). */
  sha256: string
}

export interface AgentContextProjection {
  /** Identifies the renderer so a version bump forces a resync. */
  rendererId: string
  rendererVersion: number
  /** Stable hash of every projected file; equal fingerprints mean nothing to push. */
  fingerprint: string
  files: ProjectedFile[]
}

/** What core persists between syncs (ledger row per agent and provider). */
export interface ContextSyncState {
  /** `push` writes files to the runtime; `pull` means the agent fetches them over HTTP. */
  mode: 'push' | 'pull'
  fingerprint: string
  /** Last known remote hash per path, used as the write precondition. */
  remoteHashes: Record<string, string>
}

export interface ContextSyncRequest {
  agentId: string
  bundle: AgentContextBundle
  previous?: ContextSyncState | null
  /** Overwrite files the agent changed since the last sync. */
  force?: boolean
}

export type ContextSyncOutcome =
  | { status: 'pushed'; state: ContextSyncState; changedPaths: string[] }
  | { status: 'unchanged'; state: ContextSyncState }
  | { status: 'pull_only'; state: ContextSyncState }
  | {
      status: 'conflict'
      state: ContextSyncState
      conflicts: Array<{ path: string; remoteHash: string }>
    }
