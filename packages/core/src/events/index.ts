/**
 * Event system bootstrap — registers all listeners on first import.
 * Import this module at app startup to wire up side effects.
 */

import { registerActivityListeners } from './listeners/activity-listener'
import { registerBroadcastListeners } from './listeners/broadcast-listener'
import { registerWorktreeListeners } from './listeners/worktree-listener'
import { registerOutgoingWebhookListeners } from './listeners/outgoing-webhook-listener'
import { registerContextSyncListeners } from './listeners/context-sync-listener'

// Process-wide flag (see event-bus.ts): every module instance shares the bus,
// so listeners must be registered on it exactly once.
const INITIALIZED_KEY = Symbol.for('taia.eventListenersInitialized')
const processGlobals = globalThis as unknown as Record<symbol, boolean | undefined>

export function initEventListeners(): void {
  if (processGlobals[INITIALIZED_KEY]) return
  processGlobals[INITIALIZED_KEY] = true

  registerActivityListeners()
  registerBroadcastListeners()
  registerWorktreeListeners()
  registerOutgoingWebhookListeners()
  registerContextSyncListeners()
}

// Auto-initialize on import (server-side only)
if (typeof window === 'undefined') {
  initEventListeners()
}

export { eventBus } from './event-bus'
