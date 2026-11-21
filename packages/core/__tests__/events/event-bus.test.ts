import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventBus, type DomainEvent } from '@taia/core/events/event-bus'

beforeEach(() => {
  eventBus.clear()
})

describe('eventBus', () => {
  const makeEvent = (
    type: string,
    payload: Record<string, unknown> = {},
    actor?: string,
  ): DomainEvent => ({
    type,
    payload,
    timestamp: Date.now(),
    actor,
  })

  describe('on() + emit()', () => {
    it('registers a listener that gets called on emit', async () => {
      const listener = vi.fn()
      eventBus.on('task:created', listener)

      const event = makeEvent('task:created', { taskId: 't1' })
      await eventBus.emit(event)

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(event)
    })

    it('calls all listeners for the event type', async () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()
      const listener3 = vi.fn()
      eventBus.on('task:updated', listener1)
      eventBus.on('task:updated', listener2)
      eventBus.on('task:updated', listener3)

      await eventBus.emit(makeEvent('task:updated'))

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)
      expect(listener3).toHaveBeenCalledTimes(1)
    })

    it('does not call listeners for other event types', async () => {
      const createdListener = vi.fn()
      const deletedListener = vi.fn()
      eventBus.on('task:created', createdListener)
      eventBus.on('task:deleted', deletedListener)

      await eventBus.emit(makeEvent('task:created'))

      expect(createdListener).toHaveBeenCalledTimes(1)
      expect(deletedListener).not.toHaveBeenCalled()
    })

    it('handles async listeners', async () => {
      const order: number[] = []
      eventBus.on('task:created', async () => {
        await new Promise((r) => setTimeout(r, 10))
        order.push(1)
      })
      eventBus.on('task:created', async () => {
        order.push(2)
      })

      await eventBus.emit(makeEvent('task:created'))

      expect(order).toContain(1)
      expect(order).toContain(2)
    })

    it('continues even if an async listener rejects (Promise.allSettled)', async () => {
      const successListener = vi.fn()
      eventBus.on('task:created', async () => {
        throw new Error('Boom')
      })
      eventBus.on('task:created', successListener)

      await eventBus.emit(makeEvent('task:created'))

      expect(successListener).toHaveBeenCalledTimes(1)
    })

    it('does not throw when emitting with no listeners', async () => {
      await expect(eventBus.emit(makeEvent('unknown:event'))).resolves.not.toThrow()
    })

    it('listener receives the full event object (type, payload, timestamp, actor)', async () => {
      const listener = vi.fn()
      eventBus.on('task:moved', listener)

      const event = makeEvent('task:moved', { taskId: 't1', newStatus: 'DONE' }, 'agent-1')
      await eventBus.emit(event)

      const received = listener.mock.calls[0][0] as DomainEvent
      expect(received.type).toBe('task:moved')
      expect(received.payload).toEqual({ taskId: 't1', newStatus: 'DONE' })
      expect(received.timestamp).toBeTypeOf('number')
      expect(received.actor).toBe('agent-1')
    })
  })

  describe('unsubscribe', () => {
    it('on() returns an unsubscribe function', () => {
      const unsub = eventBus.on('task:created', vi.fn())
      expect(unsub).toBeTypeOf('function')
    })

    it('unsubscribe removes the listener', async () => {
      const listener = vi.fn()
      const unsub = eventBus.on('task:created', listener)

      unsub()
      await eventBus.emit(makeEvent('task:created'))

      expect(listener).not.toHaveBeenCalled()
    })

    it('unsubscribe only removes the specific listener', async () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()
      eventBus.on('task:created', listener1)
      const unsub2 = eventBus.on('task:created', listener2)

      unsub2()
      await eventBus.emit(makeEvent('task:created'))

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).not.toHaveBeenCalled()
    })
  })

  describe('clear()', () => {
    it('removes all listeners', async () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()
      eventBus.on('task:created', listener1)
      eventBus.on('task:deleted', listener2)

      eventBus.clear()

      await eventBus.emit(makeEvent('task:created'))
      await eventBus.emit(makeEvent('task:deleted'))

      expect(listener1).not.toHaveBeenCalled()
      expect(listener2).not.toHaveBeenCalled()
    })
  })

  describe('getHealth()', () => {
    it('reports registered listeners and missing expected listeners', () => {
      eventBus.on('task:created', vi.fn(), { id: 'activity:task-created' })

      const health = eventBus.getHealth(['activity:task-created', 'broadcast:task-created'])

      expect(health.ok).toBe(false)
      expect(health.missingListeners).toEqual(['broadcast:task-created'])
      expect(health.listeners).toMatchObject([
        {
          id: 'activity:task-created',
          type: 'task:created',
          calls: 0,
          successes: 0,
          failures: 0,
        },
      ])
    })

    it('tracks last workspace and listener success/failure counters', async () => {
      eventBus.on('task:updated', vi.fn(), { id: 'listener:ok' })
      eventBus.on(
        'task:updated',
        async () => {
          throw new Error('listener failed')
        },
        { id: 'listener:fails' },
      )

      await eventBus.emit(
        makeEvent('task:updated', {
          task: { id: 't1', workspace_id: 'workspace-1' },
        }),
      )

      const health = eventBus.getHealth(['listener:ok', 'listener:fails'])
      expect(health.ok).toBe(true)
      expect(health.missingListeners).toEqual([])
      expect(health.listeners).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'listener:ok',
            calls: 1,
            successes: 1,
            failures: 0,
            lastWorkspaceId: 'workspace-1',
          }),
          expect.objectContaining({
            id: 'listener:fails',
            calls: 1,
            successes: 0,
            failures: 1,
            lastWorkspaceId: 'workspace-1',
            lastError: 'listener failed',
          }),
        ]),
      )
    })
  })
})

describe('process-wide singleton', () => {
  it('shares one bus across separate module instances (Next.js bundles each route)', async () => {
    vi.resetModules()
    const first = await import('@taia/core/events/event-bus')
    vi.resetModules()
    const second = await import('@taia/core/events/event-bus')
    expect(second.eventBus).toBe(first.eventBus)
  })
})
