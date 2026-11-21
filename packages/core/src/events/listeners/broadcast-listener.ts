/**
 * Broadcast Listener — forwards domain events to WebSocket clients
 */

import { eventBus } from '../event-bus'
import { broadcastTaskUpdate, broadcastDependencyUpdate } from '../../broadcast'

export function registerBroadcastListeners(): void {
  eventBus.on(
    'task:created',
    async (e) => {
      broadcastTaskUpdate((e.payload.task as { id: string }).id, 'created', e.payload.task)
    },
    { id: 'broadcast:task-created' },
  )

  eventBus.on(
    'task:updated',
    async (e) => {
      broadcastTaskUpdate((e.payload.task as { id: string }).id, 'updated', e.payload.task)
    },
    { id: 'broadcast:task-updated' },
  )

  eventBus.on(
    'task:moved',
    async (e) => {
      broadcastTaskUpdate((e.payload.task as { id: string }).id, 'moved', e.payload.task)
    },
    { id: 'broadcast:task-moved' },
  )

  eventBus.on(
    'task:deleted',
    async (e) => {
      broadcastTaskUpdate(e.payload.taskId as string, 'deleted')
    },
    { id: 'broadcast:task-deleted' },
  )

  eventBus.on(
    'task:assigned',
    async (e) => {
      broadcastTaskUpdate((e.payload.task as { id: string }).id, 'updated', e.payload.task)
    },
    { id: 'broadcast:task-assigned' },
  )

  eventBus.on(
    'dependency:added',
    async (e) => {
      broadcastDependencyUpdate(e.payload.taskId as string, 'added', e.payload)
    },
    { id: 'broadcast:dependency-added' },
  )

  eventBus.on(
    'dependency:removed',
    async (e) => {
      broadcastDependencyUpdate(e.payload.taskId as string, 'removed', e.payload)
    },
    { id: 'broadcast:dependency-removed' },
  )
}
