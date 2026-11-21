// Capability → tool mapping for the AnthropicAdapter.
//
// Each AgentCapability declared in `bundle.agent.capabilities` resolves to one
// or more concrete Anthropic tool names. The adapter filters TAIA_TOOLS (and
// the memory tool) by the resulting set so each agent only sees the tools it
// is authorized to use.
//
// Adding a capability:
//  1. Extend the AgentCapability union in @taia/types/src/context.ts.
//  2. Add an entry below.
//  3. Implement the underlying tool(s) in tools.ts and the executor in
//     core/anthropic-wiring.ts.
//
// Reference: apps/docs/src/content/docs/arquitectura/modelo-de-contexto.md ("Capabilities → tools")

import type { AgentCapability } from '@taia/types'

export const CAPABILITY_TOOLS: Record<AgentCapability, readonly string[]> = {
  read_tasks: ['taia_tasks_list', 'taia_tasks_get'],
  write_tasks: ['taia_tasks_create', 'taia_tasks_update'],
  comment_tasks: ['taia_tasks_comment'],
  read_stats: ['taia_stats_get'],
  read_own_files: ['taia_agent_context_read'],
  // memory_20250818 — Anthropic-managed tool, schema is provided by the SDK.
  memory: ['memory'],
}

/**
 * Resolve the deduplicated set of tool names for the given capabilities.
 * Throws when a capability is declared but has no mapping in this adapter —
 * fail loud per ADR-003 so a misconfiguration shows up at the first spawn.
 */
export function resolveCapabilityTools(capabilities: readonly AgentCapability[]): string[] {
  const out = new Set<string>()
  for (const cap of capabilities) {
    const tools = CAPABILITY_TOOLS[cap]
    if (!tools) {
      throw new Error(
        `AnthropicAdapter does not support capability '${cap}'. ` +
          `Supported: ${Object.keys(CAPABILITY_TOOLS).join(', ')}.`,
      )
    }
    for (const t of tools) out.add(t)
  }
  return Array.from(out)
}
