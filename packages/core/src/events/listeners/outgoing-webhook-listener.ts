import { eventBus } from '../event-bus'

const OUTGOING_WEBHOOK_EVENTS = [
  'task:created',
  'task:updated',
  'task:moved',
  'task:deleted',
  'task:assigned',
  'dependency:added',
  'dependency:removed',
]

export function registerOutgoingWebhookListeners(): void {
  for (const eventType of OUTGOING_WEBHOOK_EVENTS) {
    eventBus.on(
      eventType,
      async (event) => {
        const { handleOutgoingWebhookEvent } = await import(
          '../../services/outgoing-webhook.service'
        )
        await handleOutgoingWebhookEvent(event)
      },
      { id: `outgoing-webhook:${eventType.replace(':', '-')}` },
    )
  }
}
