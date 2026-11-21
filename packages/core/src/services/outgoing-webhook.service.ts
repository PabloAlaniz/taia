import { createHmac } from 'node:crypto'
import type { DomainEvent } from '../events/event-bus'
import { logActivity } from '../db'
import { getSetting, setSetting } from '../db/repositories/setting.repository'
import { assertPublicWebhookUrl } from '../outbound-url-policy'

export const OUTGOING_WEBHOOK_MAX_ATTEMPTS = 3
export const OUTGOING_WEBHOOK_MAX_REPLAY_ATTEMPTS = 2
export const OUTGOING_WEBHOOK_TIMEOUT_MS = 2_000
export const OUTGOING_WEBHOOK_BACKOFF_MS = [0, 250, 1_000] as const
export const OUTGOING_WEBHOOK_LEDGER_LIMIT = 100

export interface OutgoingWebhookEndpoint {
  id: string
  url: string
  secret?: string
  active?: boolean
  events?: string[]
}

export interface OutgoingWebhookAttempt {
  attempt: number
  status: 'success' | 'failed'
  statusCode?: number
  error?: string
  attemptedAt: string
  durationMs: number
  nextRetryAt?: string
}

export interface OutgoingWebhookDelivery {
  id: string
  endpointId: string
  event: string
  workspaceId: string
  url: string
  payloadHash: string
  status: 'success' | 'failed' | 'dead_letter'
  createdAt: string
  updatedAt: string
  attempts: OutgoingWebhookAttempt[]
  payload?: unknown
  replayAttempts?: number
  deadLetteredAt?: string
}

type DeliveryLedger = Record<string, OutgoingWebhookDelivery>

function endpointsKey(workspaceId: string): string {
  return `webhooks.outgoing.${workspaceId}.endpoints`
}

function deliveriesKey(workspaceId: string): string {
  return `webhooks.outgoing.${workspaceId}.deliveries`
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hashPayload(value: unknown): string {
  return createHmac('sha256', 'taia-outgoing-webhook').update(JSON.stringify(value)).digest('hex')
}

function deliveryId(endpointId: string, event: string, payloadHash: string): string {
  return `${endpointId}:${event}:${payloadHash}`
}

function inferWorkspaceId(event: DomainEvent): string | null {
  const task = event.payload.task as { workspace_id?: unknown } | undefined
  const workspaceId =
    event.payload.workspace_id ??
    event.payload.workspaceId ??
    task?.workspace_id ??
    event.payload.workspace
  return typeof workspaceId === 'string' && workspaceId.trim() ? workspaceId.trim() : null
}

function pruneLedger(ledger: DeliveryLedger): DeliveryLedger {
  return Object.fromEntries(
    Object.entries(ledger)
      .sort(([, a], [, b]) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, OUTGOING_WEBHOOK_LEDGER_LIMIT),
  )
}

function shouldSend(endpoint: OutgoingWebhookEndpoint, eventType: string): boolean {
  if (endpoint.active === false) return false
  if (!endpoint.url) return false
  if (!endpoint.events || endpoint.events.length === 0) return true
  return endpoint.events.includes(eventType) || endpoint.events.includes('*')
}

async function readLedger(workspaceId: string): Promise<DeliveryLedger> {
  return parseJson<DeliveryLedger>(await getSetting(deliveriesKey(workspaceId)), {})
}

async function writeLedger(workspaceId: string, ledger: DeliveryLedger): Promise<void> {
  await setSetting(deliveriesKey(workspaceId), JSON.stringify(pruneLedger(ledger)))
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // Never follow redirects: the target was checked, the redirect wasn't.
    return await fetch(url, { ...init, redirect: 'manual', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function postDeliveryAttempt(args: {
  endpoint: OutgoingWebhookEndpoint
  eventType: string
  workspaceId: string
  body: string
  signature?: string
  attemptNumber: number
}): Promise<OutgoingWebhookAttempt> {
  const started = Date.now()
  try {
    // Checked on every attempt, not when the endpoint is saved: endpoints are
    // plain settings, and a name can start resolving somewhere else.
    await assertPublicWebhookUrl(args.endpoint.url)
    const response = await fetchWithTimeout(
      args.endpoint.url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-taia-event': args.eventType,
          'x-taia-workspace-id': args.workspaceId,
          ...(args.signature ? { 'x-taia-signature': args.signature } : {}),
        },
        body: args.body,
      },
      OUTGOING_WEBHOOK_TIMEOUT_MS,
    )
    const attemptedAt = new Date().toISOString()
    return {
      attempt: args.attemptNumber,
      status: response.ok ? 'success' : 'failed',
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`,
      attemptedAt,
      durationMs: Date.now() - started,
    }
  } catch (error) {
    return {
      attempt: args.attemptNumber,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      attemptedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
    }
  }
}

/** An endpoint as the API shows it: the signing secret never leaves the server. */
export type OutgoingWebhookEndpointSummary = Omit<OutgoingWebhookEndpoint, 'secret'> & {
  hasSecret: boolean
}

export async function listOutgoingWebhookDiagnostics(workspaceId: string): Promise<{
  endpoints: OutgoingWebhookEndpointSummary[]
  deliveries: OutgoingWebhookDelivery[]
  deadLetters: OutgoingWebhookDelivery[]
}> {
  const endpoints = parseJson<OutgoingWebhookEndpoint[]>(
    await getSetting(endpointsKey(workspaceId)),
    [],
  )
  const ledger = await readLedger(workspaceId)
  const deliveries = Object.values(ledger).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
  return {
    endpoints: endpoints.map(({ secret, ...endpoint }) => ({ ...endpoint, hasSecret: !!secret })),
    deliveries,
    deadLetters: deliveries.filter((delivery) => delivery.status === 'dead_letter'),
  }
}

export async function deliverOutgoingWebhook(args: {
  workspaceId: string
  endpoint: OutgoingWebhookEndpoint
  event: DomainEvent
  now?: Date
}): Promise<OutgoingWebhookDelivery> {
  const now = args.now ?? new Date()
  const basePayload = {
    type: args.event.type,
    actor: args.event.actor,
    timestamp: args.event.timestamp,
    workspace_id: args.workspaceId,
    payload: args.event.payload,
  }
  const payloadHash = hashPayload({
    endpointId: args.endpoint.id,
    event: args.event.type,
    payload: basePayload,
  })
  const id = deliveryId(args.endpoint.id, args.event.type, payloadHash)
  const payload = { id, ...basePayload }
  const ledger = await readLedger(args.workspaceId)
  const existing = ledger[id]
  if (existing?.status === 'success') return existing

  const delivery: OutgoingWebhookDelivery = existing ?? {
    id,
    endpointId: args.endpoint.id,
    event: args.event.type,
    workspaceId: args.workspaceId,
    url: args.endpoint.url,
    payloadHash,
    status: 'failed',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    attempts: [],
    payload,
  }
  delivery.payload ??= payload

  const body = JSON.stringify(payload)
  const signature = args.endpoint.secret
    ? `sha256=${createHmac('sha256', args.endpoint.secret).update(body).digest('hex')}`
    : undefined

  for (
    let attempt = delivery.attempts.length + 1;
    attempt <= OUTGOING_WEBHOOK_MAX_ATTEMPTS;
    attempt++
  ) {
    if (attempt > 1) await sleep(OUTGOING_WEBHOOK_BACKOFF_MS[attempt - 1] ?? 1_000)
    const attemptRecord = await postDeliveryAttempt({
      endpoint: args.endpoint,
      eventType: args.event.type,
      workspaceId: args.workspaceId,
      body,
      signature,
      attemptNumber: attempt,
    })
    const success = attemptRecord.status === 'success'
    attemptRecord.nextRetryAt =
      success || attempt >= OUTGOING_WEBHOOK_MAX_ATTEMPTS
        ? undefined
        : new Date(Date.now() + (OUTGOING_WEBHOOK_BACKOFF_MS[attempt] ?? 1_000)).toISOString()
    delivery.attempts.push(attemptRecord)
    delivery.status = success ? 'success' : 'failed'
    if (!success && attempt >= OUTGOING_WEBHOOK_MAX_ATTEMPTS) {
      delivery.status = 'dead_letter'
      delivery.deadLetteredAt = attemptRecord.attemptedAt
    }
    delivery.updatedAt = attemptRecord.attemptedAt
    ledger[id] = delivery
    await writeLedger(args.workspaceId, ledger)
    if (success) break
  }

  await logActivity({
    type: delivery.status === 'success' ? 'webhook.outgoing.delivered' : 'webhook.outgoing.failed',
    agent_id: 'system',
    workspace_id: args.workspaceId,
    message: `Outgoing webhook ${delivery.status === 'success' ? 'success' : delivery.status}: ${args.event.type} -> ${args.endpoint.id} (${delivery.attempts.length} attempt${delivery.attempts.length === 1 ? '' : 's'})`,
    metadata: {
      workspace_id: args.workspaceId,
      delivery_id: delivery.id,
      endpoint_id: args.endpoint.id,
      event: args.event.type,
      attempts: delivery.attempts.length,
      status: delivery.status,
      last_error: delivery.attempts[delivery.attempts.length - 1]?.error,
    },
  })

  return delivery
}

export async function replayOutgoingWebhookDelivery(args: {
  workspaceId: string
  deliveryId: string
}): Promise<{ replayed: boolean; delivery: OutgoingWebhookDelivery }> {
  const ledger = await readLedger(args.workspaceId)
  const delivery = ledger[args.deliveryId]
  if (!delivery) throw new Error(`Outgoing webhook delivery not found: ${args.deliveryId}`)
  if (delivery.status === 'success') return { replayed: false, delivery }
  if ((delivery.replayAttempts ?? 0) >= OUTGOING_WEBHOOK_MAX_REPLAY_ATTEMPTS) {
    throw new Error(
      `Outgoing webhook delivery ${args.deliveryId} reached replay limit (${OUTGOING_WEBHOOK_MAX_REPLAY_ATTEMPTS})`,
    )
  }

  const endpoints = parseJson<OutgoingWebhookEndpoint[]>(
    await getSetting(endpointsKey(args.workspaceId)),
    [],
  )
  const endpoint = endpoints.find((candidate) => candidate.id === delivery.endpointId)
  if (!endpoint) throw new Error(`Outgoing webhook endpoint not found: ${delivery.endpointId}`)

  const body = JSON.stringify(delivery.payload ?? { id: delivery.id })
  const signature = endpoint.secret
    ? `sha256=${createHmac('sha256', endpoint.secret).update(body).digest('hex')}`
    : undefined
  const attemptRecord = await postDeliveryAttempt({
    endpoint,
    eventType: delivery.event,
    workspaceId: args.workspaceId,
    body,
    signature,
    attemptNumber: delivery.attempts.length + 1,
  })
  delivery.attempts.push(attemptRecord)
  delivery.replayAttempts = (delivery.replayAttempts ?? 0) + 1
  delivery.status = attemptRecord.status === 'success' ? 'success' : 'dead_letter'
  delivery.updatedAt = attemptRecord.attemptedAt
  if (delivery.status === 'dead_letter') delivery.deadLetteredAt = attemptRecord.attemptedAt
  ledger[delivery.id] = delivery
  await writeLedger(args.workspaceId, ledger)

  await logActivity({
    type:
      delivery.status === 'success'
        ? 'webhook.outgoing.replayed'
        : 'webhook.outgoing.replay_failed',
    agent_id: 'system',
    workspace_id: args.workspaceId,
    message: `Outgoing webhook replay ${delivery.status === 'success' ? 'success' : 'failed'}: ${delivery.event} -> ${delivery.endpointId}`,
    metadata: {
      workspace_id: args.workspaceId,
      delivery_id: delivery.id,
      endpoint_id: delivery.endpointId,
      event: delivery.event,
      replay_attempts: delivery.replayAttempts,
      status: delivery.status,
      last_error: attemptRecord.error,
    },
  })

  return { replayed: true, delivery }
}

export async function handleOutgoingWebhookEvent(
  event: DomainEvent,
): Promise<OutgoingWebhookDelivery[]> {
  const workspaceId = inferWorkspaceId(event)
  if (!workspaceId) return []

  const endpoints = parseJson<OutgoingWebhookEndpoint[]>(
    await getSetting(endpointsKey(workspaceId)),
    [],
  )
  const active = endpoints.filter((endpoint) => shouldSend(endpoint, event.type))
  if (active.length === 0) return []

  const deliveries: OutgoingWebhookDelivery[] = []
  for (const endpoint of active) {
    deliveries.push(await deliverOutgoingWebhook({ workspaceId, endpoint, event }))
  }
  return deliveries
}
