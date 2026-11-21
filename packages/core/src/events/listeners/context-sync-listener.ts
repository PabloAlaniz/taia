/**
 * Context sync listener — pushes an agent's context to runtimes that keep it
 * as native files whenever its identity changes (ADR-005).
 */

import { eventBus } from '../event-bus'

export function registerContextSyncListeners(): void {
  eventBus.on(
    'agent-context:changed',
    async (e) => {
      const { ensureAgentContextSynced } = await import('../../services/context-sync.service')
      await ensureAgentContextSynced(e.payload.agentId as string)
    },
    { id: 'context-sync:agent-context-changed' },
  )
}
