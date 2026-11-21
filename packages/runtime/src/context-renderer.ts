// AgentContextRenderer — translates a runtime-agnostic AgentContextBundle to
// the native shape the underlying runtime expects.
//
// Each adapter that supports per-agent context defines its own RenderedContext
// type (Anthropic Messages blocks, OpenAI Assistant config, etc) and returns
// it from `render`. The adapter's spawnSession then forwards it to its client.
//
// This file only defines the shape of the contract — the implementation lives
// in each adapter's `context-renderer.ts`.
//
// Reference: apps/docs/src/content/docs/arquitectura/modelo-de-contexto.md ("Cómo cada adapter renderea")

import type { AgentContextBundle } from '@taia/types'
import type { SpawnTrigger } from './types'

/** Per-render hints. */
export interface RenderOptions {
  /** Optional override of the maximum cache breakpoints the adapter should use. */
  maxCacheBreakpoints?: number
  /** Why the session starts; renderers phrase the kickoff message from it. */
  trigger?: SpawnTrigger
  /** The caller's own text, used as the kickoff for `prompt` triggers. */
  prompt?: string
}

/**
 * Generic renderer contract. The output shape is adapter-specific — the
 * generic parameter `TRendered` keeps this file independent of any provider
 * SDK while still typing the return value at each adapter's call site.
 */
export interface AgentContextRenderer<TRendered = unknown> {
  render(bundle: AgentContextBundle, options?: RenderOptions): TRendered
}
