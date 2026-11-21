// AnthropicContextRenderer — translates an AgentContextBundle into the shapes
// that AnthropicClient.runSessionLoop consumes:
//
//  - systemBlocks: Anthropic.TextBlockParam[] with cache_control: ephemeral on
//    the stable layers (agent identity, project, user). Cache hit rate is
//    high turn-to-turn because these layers change rarely.
//  - taskMessage: the kickoff that becomes the first user message, phrased
//    from the spawn trigger (see context-markdown.ts).
//  - toolNames: the deduplicated allowlist resolved from agent capabilities.
//
// What is NOT rendered here:
//  - Recall messages (`bundle.memory.recall`) — the adapter loads message
//    history from its store; the renderer only delivers the static prefix.
//  - Archival memory — fetched on demand via the memory tool.
//
// Anthropic permits up to 4 cache breakpoints per request; we use 3 here
// (agent + project + user). The 4th is consumed by `withCachedTools` in
// client.ts to cache the tools array.
//
// Reference: apps/docs/src/content/docs/arquitectura/modelo-de-contexto.md ("AnthropicContextRenderer")

import type Anthropic from '@anthropic-ai/sdk'
import type { AgentContextBundle } from '@taia/types'

import type { AgentContextRenderer, RenderOptions } from '../../context-renderer'
import {
  renderAgentIdentity,
  renderKickoff,
  renderProjectContext,
  renderUserProfile,
} from '../../context-markdown'
import { resolveCapabilityTools } from './capabilities'

export interface RenderedAnthropicContext {
  systemBlocks: Anthropic.TextBlockParam[]
  taskMessage: string
  toolNames: string[]
}

export class AnthropicContextRenderer implements AgentContextRenderer<RenderedAnthropicContext> {
  render(bundle: AgentContextBundle, options?: RenderOptions): RenderedAnthropicContext {
    const systemBlocks: Anthropic.TextBlockParam[] = [
      {
        type: 'text',
        text: renderAgentIdentity(bundle.agent),
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: renderProjectContext(bundle.project),
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: renderUserProfile(bundle.user),
        cache_control: { type: 'ephemeral' },
      },
    ]

    return {
      systemBlocks,
      taskMessage: renderKickoff(bundle, options?.trigger, options?.prompt ?? ''),
      toolNames: resolveCapabilityTools(bundle.agent.capabilities),
    }
  }
}
