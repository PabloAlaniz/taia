// Broadcast helper - sends events to the WebSocket server
// The WS server listens on WS_PORT (13334), its broadcast endpoint on BROADCAST_PORT (13335)

import type { WSEventType, WSMessage } from '@taia/types'
import { internalAuthHeaders } from './auth'
import { config } from './config'

async function broadcast(message: WSMessage): Promise<void> {
  try {
    await fetch(config.broadcast.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
      body: JSON.stringify(message),
    })
  } catch (err) {
    // WS server might not be running, ignore silently
    console.warn('[Broadcast] Failed:', (err as Error).message)
  }
}

// Convenience functions
export async function broadcastTaskUpdate(
  taskId: string,
  action: 'created' | 'updated' | 'moved' | 'deleted',
  task?: unknown,
) {
  await broadcast({
    type: `task:${action}` as WSEventType,
    payload: { taskId, task },
    timestamp: Date.now(),
  })
}

export async function broadcastAgentStatus(agentId: string, status: string, taskId?: string) {
  await broadcast({
    type: 'agent:status',
    payload: { agentId, status, taskId },
    timestamp: Date.now(),
  })
}

export async function broadcastActivity(activity: Record<string, unknown>) {
  await broadcast({
    type: 'activity:new',
    payload: activity,
    timestamp: Date.now(),
  })
}

export async function broadcastWorktreeUpdate(
  worktreeId: string,
  action: 'created' | 'updated' | 'merged',
  worktree?: unknown,
) {
  await broadcast({
    type: `worktree:${action}` as WSEventType,
    payload: { worktreeId, worktree },
    timestamp: Date.now(),
  })
}

export async function broadcastDependencyUpdate(
  taskId: string,
  action: 'added' | 'removed',
  detail?: Record<string, unknown>,
) {
  await broadcast({
    type: `dependency:${action}` as WSEventType,
    payload: { taskId, ...detail },
    timestamp: Date.now(),
  })
}
