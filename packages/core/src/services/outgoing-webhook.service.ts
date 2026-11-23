// Outgoing webhooks. Emitting a domain event only queues a message per
// endpoint (webhook_outbox); the dispatcher, which runs in the web process,
// sends what is due with omniwebhook: Standard Webhooks signatures, a URL
// policy that connects to the address it checked, and the next attempt's time
// when a delivery has to be retried. Every attempt lands in omniwebhook_attempts.

import {
  type AttemptRecord,
  allowedNetworks,
  ConfigurationError,
  inspectDestination,
  PostgresDeliveryLedger,
  randomMessageId,
  type SendWebhook,
} from 'omniwebhook'
import { createNodeSender } from 'omniwebhook/node'
import { standardSigner } from 'omniwebhook/standard'
import { z } from 'zod'
import { logActivity } from '../db'
import { pool } from '../db/pool'
import { getSetting, setSetting } from '../db/repositories/setting.repository'
import {
  claimDueOutboxMessages,
  enqueueOutboxMessages,
  findOutboxMessage,
  listOutboxAttempts,
  listOutboxMessages,
  type OutboxAttempt,
  type OutboxMessage,
  type OutboxOutcome,
  purgeSettledOutboxMessages,
  requeueOutboxMessage,
  settleOutboxMessage,
} from '../db/repositories/webhook-outbox.repository'
import type { DomainEvent } from '../events/event-bus'

/** How many times a failed delivery can be sent again by hand. */
export const OUTGOING_WEBHOOK_MAX_REPLAYS = 2
/** How many messages one dispatch round takes. */
export const WEBHOOK_DISPATCH_BATCH = 10
/** How often the dispatcher looks for due messages. */
export const WEBHOOK_DISPATCH_INTERVAL_MS = 2_000
/** How long a taken message stays locked: more than an attempt can last. */
export const WEBHOOK_DISPATCH_LOCK_SECONDS = 60
/** How many messages the diagnostics list. */
export const OUTGOING_WEBHOOK_DIAGNOSTICS_LIMIT = 100

/** Private ranges `TAIA_WEBHOOK_ALLOW_PRIVATE=1` opens: loopback, RFC 1918 and IPv6 ULA. */
export const PRIVATE_NETWORKS = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '::1/128',
  'fc00::/7',
] as const

const SECRET = /^whsec_[A-Za-z0-9+/]+={0,2}$/

const endpointSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^/]+$/, 'id cannot contain "/"'),
  url: z
    .string()
    .refine((url) => typeof inspectDestination(url, { allowHttp: true }) !== 'string', {
      message: 'url must be an http(s) URL without credentials',
    }),
  secret: z.string().regex(SECRET, 'secret must be whsec_<base64>'),
  active: z.boolean().optional(),
  events: z.array(z.string().min(1)).optional(),
})

export type OutgoingWebhookEndpoint = z.infer<typeof endpointSchema>

/** An endpoint as the API shows it: the signing secret never leaves the server. */
export type OutgoingWebhookEndpointSummary = Omit<OutgoingWebhookEndpoint, 'secret'> & {
  hasSecret: boolean
}

export function outgoingEndpointsKey(workspaceId: string): string {
  return `webhooks.outgoing.${workspaceId}.endpoints`
}

/**
 * Check a `webhooks.outgoing.<ws>.endpoints` value before it is saved: a JSON
 * array of endpoints, each with an id, a URL of the accepted shape and a
 * `whsec_` secret. Answers the problem, or null when it is fine.
 */
export function outgoingEndpointsProblem(value: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return 'webhooks.outgoing.*.endpoints must be a JSON array'
  }
  const result = z.array(endpointSchema).safeParse(parsed)
  if (!result.success) {
    const issue = result.error.issues[0]
    return `Invalid outgoing webhook endpoint at ${issue?.path.join('.') || '(root)'}: ${issue?.message}`
  }
  const ids = result.data.map((endpoint) => endpoint.id)
  if (new Set(ids).size !== ids.length) return 'Outgoing webhook endpoint ids must be unique'
  return null
}

/** The endpoints saved for a workspace. A malformed entry is skipped, not fatal. */
async function readEndpoints(workspaceId: string): Promise<OutgoingWebhookEndpoint[]> {
  const raw = await getSetting(outgoingEndpointsKey(workspaceId))
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((entry) => {
    const result = endpointSchema.safeParse(entry)
    return result.success ? [result.data] : []
  })
}

function shouldSend(endpoint: OutgoingWebhookEndpoint, eventType: string): boolean {
  if (endpoint.active === false) return false
  if (!endpoint.events || endpoint.events.length === 0) return true
  return endpoint.events.includes(eventType) || endpoint.events.includes('*')
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

/**
 * Queue a domain event for every active endpoint of its workspace that wants
 * it. Only inserts rows: the request that emitted the event does not wait on
 * any receiver. Answers how many messages were queued.
 */
export async function handleOutgoingWebhookEvent(event: DomainEvent): Promise<number> {
  const workspaceId = inferWorkspaceId(event)
  if (!workspaceId) return 0

  const endpoints = (await readEndpoints(workspaceId)).filter((endpoint) =>
    shouldSend(endpoint, event.type),
  )
  if (endpoints.length === 0) return 0

  // The Standard Webhooks payload shape: type, timestamp and the event's data.
  const payload = JSON.stringify({
    type: event.type,
    timestamp: new Date(event.timestamp).toISOString(),
    workspace_id: workspaceId,
    actor: event.actor,
    data: event.payload,
  })
  await enqueueOutboxMessages(
    endpoints.map((endpoint) => ({
      workspaceId,
      endpointId: endpoint.id,
      messageId: randomMessageId(),
      event: event.type,
      payload,
    })),
  )
  return endpoints.length
}

/**
 * The networks outgoing webhooks may reach although they are private:
 * `TAIA_WEBHOOK_ALLOW_PRIVATE=1` opens loopback, RFC 1918 and IPv6 ULA, and
 * `TAIA_WEBHOOK_ALLOWED_NETWORKS` adds a comma-separated list of CIDRs.
 * Cloud metadata addresses stay blocked whatever is allowed.
 */
export function webhookAllowedNetworks(env: NodeJS.ProcessEnv = process.env): string[] {
  const networks: string[] = []
  if (env.TAIA_WEBHOOK_ALLOW_PRIVATE === '1') networks.push(...PRIVATE_NETWORKS)
  for (const cidr of (env.TAIA_WEBHOOK_ALLOWED_NETWORKS ?? '').split(',')) {
    if (cidr.trim()) networks.push(cidr.trim())
  }
  allowedNetworks(networks) // throws ConfigurationError on a malformed CIDR
  return networks
}

/** Builds the sender for an endpoint's secret. Tests pass their own. */
export type SenderFactory = (secret: string) => SendWebhook

export function nodeSenderFactory(networks: string[] = webhookAllowedNetworks()): SenderFactory {
  const ledger = new PostgresDeliveryLedger(pool)
  return (secret) =>
    createNodeSender({
      signer: standardSigner({ secrets: [secret] }),
      ledger,
      // Receivers on a LAN (n8n, a local script) often have no TLS.
      allowHttp: true,
      allowedNetworks: networks,
    })
}

/** The key omniwebhook_attempts uses for an endpoint: ids are unique per workspace only. */
function ledgerEndpointId(message: OutboxMessage): string {
  return `${message.workspaceId}/${message.endpointId}`
}

function outcomeOf(record: AttemptRecord): OutboxOutcome {
  if (record.state === 'pending') {
    return {
      state: 'pending',
      result: 'pending',
      status: record.status,
      attempt: record.attempt + 1,
      nextAt: new Date((record.nextAt ?? record.at) * 1000),
    }
  }
  return {
    state: record.state === 'delivered' ? 'delivered' : 'failed',
    result: record.problem ? `${record.state}:${record.problem}` : record.state,
    status: record.status,
  }
}

async function disableEndpoint(workspaceId: string, endpointId: string): Promise<void> {
  const raw = await getSetting(outgoingEndpointsKey(workspaceId))
  if (!raw) return
  const endpoints = JSON.parse(raw) as Array<{ id?: unknown; active?: boolean }>
  if (!Array.isArray(endpoints)) return
  for (const endpoint of endpoints) if (endpoint.id === endpointId) endpoint.active = false
  await setSetting(outgoingEndpointsKey(workspaceId), JSON.stringify(endpoints))
}

async function logSettled(message: OutboxMessage, outcome: OutboxOutcome): Promise<void> {
  if (outcome.state === 'pending') return
  const delivered = outcome.state === 'delivered'
  await logActivity({
    type: delivered ? 'webhook.outgoing.delivered' : 'webhook.outgoing.failed',
    agent_id: 'system',
    workspace_id: message.workspaceId,
    message: `Outgoing webhook ${delivered ? 'delivered' : `failed (${outcome.result})`}: ${message.event} -> ${message.endpointId} (attempt ${message.attempt})`,
    metadata: {
      workspace_id: message.workspaceId,
      delivery_id: message.messageId,
      endpoint_id: message.endpointId,
      event: message.event,
      attempt: message.attempt,
      result: outcome.result,
      status: outcome.status,
    },
  })
}

async function deliver(
  message: OutboxMessage,
  endpoints: OutgoingWebhookEndpoint[],
  senderFor: SenderFactory,
): Promise<OutboxOutcome> {
  const endpoint = endpoints.find((candidate) => candidate.id === message.endpointId)
  if (!endpoint) return { state: 'failed', result: 'endpoint_missing', status: null }
  if (endpoint.active === false) {
    return { state: 'failed', result: 'endpoint_inactive', status: null }
  }

  let record: AttemptRecord
  try {
    record = await senderFor(endpoint.secret).execute({
      endpoint: { id: ledgerEndpointId(message), url: endpoint.url },
      message: { id: message.messageId, payload: new TextEncoder().encode(message.payload) },
      attempt: message.attempt,
    })
  } catch (error) {
    // A secret that cannot sign: nothing was sent, and retrying will not help.
    if (error instanceof ConfigurationError) {
      return { state: 'failed', result: 'misconfigured', status: null }
    }
    throw error
  }

  if (record.state === 'gone') {
    // 410: the receiver says it is gone for good. Stop sending to it.
    await disableEndpoint(message.workspaceId, message.endpointId)
    await logActivity({
      type: 'webhook.outgoing.endpoint_disabled',
      agent_id: 'system',
      workspace_id: message.workspaceId,
      message: `Outgoing webhook endpoint ${message.endpointId} answered 410 Gone and was disabled`,
      metadata: { workspace_id: message.workspaceId, endpoint_id: message.endpointId },
    })
  }
  return outcomeOf(record)
}

/**
 * One dispatch round: take what is due, make one attempt for each and record
 * how it went. A message that has to be retried goes back to pending with the
 * time omniwebhook gives for its next attempt. Answers how many were taken.
 */
export async function dispatchDueWebhooks(
  senderFor: SenderFactory = nodeSenderFactory(),
): Promise<number> {
  const due = await claimDueOutboxMessages(WEBHOOK_DISPATCH_BATCH, WEBHOOK_DISPATCH_LOCK_SECONDS)
  if (due.length === 0) return 0

  const endpointsByWorkspace = new Map<string, Promise<OutgoingWebhookEndpoint[]>>()
  const endpointsOf = (workspaceId: string) => {
    let endpoints = endpointsByWorkspace.get(workspaceId)
    if (!endpoints) {
      endpoints = readEndpoints(workspaceId)
      endpointsByWorkspace.set(workspaceId, endpoints)
    }
    return endpoints
  }

  await Promise.all(
    due.map(async (message) => {
      try {
        const outcome = await deliver(message, await endpointsOf(message.workspaceId), senderFor)
        await settleOutboxMessage(message.id, outcome)
        await logSettled(message, outcome)
      } catch (error) {
        // Left locked: it is taken again when the lock runs out.
        console.warn(
          `[webhooks] dispatching ${message.messageId} failed:`,
          error instanceof Error ? error.message : error,
        )
      }
    }),
  )
  return due.length
}

/**
 * Dispatch due webhooks now and then every couple of seconds. A round never
 * overlaps the previous one; a failed round is logged and the next one tries
 * again. The timer does not keep the process alive.
 */
export function startWebhookDispatcher(round?: () => Promise<number>): () => void {
  const dispatch =
    round ??
    (() => {
      const senderFor = nodeSenderFactory()
      return () => dispatchDueWebhooks(senderFor)
    })()
  let running = false
  const run = () => {
    if (running) return
    running = true
    dispatch()
      .catch((error: unknown) => {
        console.warn(
          '[webhooks] dispatch round failed:',
          error instanceof Error ? error.message : error,
        )
      })
      .finally(() => {
        running = false
      })
  }
  run()
  const timer = setInterval(run, WEBHOOK_DISPATCH_INTERVAL_MS)
  timer.unref?.()
  return () => clearInterval(timer)
}

export interface OutgoingWebhookDelivery {
  id: string
  endpointId: string
  event: string
  status: 'pending' | 'delivered' | 'failed'
  attempt: number
  nextAttemptAt: string | null
  lastResult: string | null
  lastStatus: number | null
  replays: number
  createdAt: string
  updatedAt: string
  attempts: Array<Omit<OutboxAttempt, 'messageId' | 'at'> & { at: string }>
}

function toDelivery(message: OutboxMessage, attempts: OutboxAttempt[]): OutgoingWebhookDelivery {
  return {
    id: message.messageId,
    endpointId: message.endpointId,
    event: message.event,
    status: message.state,
    attempt: message.attempt,
    nextAttemptAt: message.state === 'pending' ? message.nextAt.toISOString() : null,
    lastResult: message.lastResult,
    lastStatus: message.lastStatus,
    replays: message.replays,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    attempts: attempts
      .filter((attempt) => attempt.messageId === message.messageId)
      .map(({ messageId: _id, at, ...attempt }) => ({ ...attempt, at: at.toISOString() })),
  }
}

export async function listOutgoingWebhookDiagnostics(workspaceId: string): Promise<{
  endpoints: OutgoingWebhookEndpointSummary[]
  deliveries: OutgoingWebhookDelivery[]
  deadLetters: OutgoingWebhookDelivery[]
}> {
  const endpoints = await readEndpoints(workspaceId)
  const messages = await listOutboxMessages(workspaceId, OUTGOING_WEBHOOK_DIAGNOSTICS_LIMIT)
  const attempts = await listOutboxAttempts(messages.map((message) => message.messageId))
  const deliveries = messages.map((message) => toDelivery(message, attempts))
  return {
    endpoints: endpoints.map(({ secret, ...endpoint }) => ({ ...endpoint, hasSecret: !!secret })),
    deliveries,
    deadLetters: deliveries.filter((delivery) => delivery.status === 'failed'),
  }
}

/** Thrown when a replay is asked for something that cannot be replayed. */
export class OutgoingWebhookReplayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'OutgoingWebhookReplayError'
  }
}

/**
 * Send a failed delivery again, from its first attempt and with the same
 * message id, so a receiver that already processed it can tell. A delivered
 * or pending one is left alone; each delivery can be replayed a couple of times.
 */
export async function replayOutgoingWebhookDelivery(args: {
  workspaceId: string
  deliveryId: string
}): Promise<{ replayed: boolean; delivery: OutgoingWebhookDelivery }> {
  const message = await findOutboxMessage(args.workspaceId, args.deliveryId)
  if (!message) {
    throw new OutgoingWebhookReplayError(
      404,
      `Outgoing webhook delivery not found: ${args.deliveryId}`,
    )
  }
  if (message.state !== 'failed') {
    return { replayed: false, delivery: toDelivery(message, []) }
  }
  if (!(await requeueOutboxMessage(message.id, OUTGOING_WEBHOOK_MAX_REPLAYS))) {
    throw new OutgoingWebhookReplayError(
      409,
      `Outgoing webhook delivery ${args.deliveryId} reached the replay limit (${OUTGOING_WEBHOOK_MAX_REPLAYS})`,
    )
  }
  await logActivity({
    type: 'webhook.outgoing.replayed',
    agent_id: 'system',
    workspace_id: args.workspaceId,
    message: `Outgoing webhook queued again: ${message.event} -> ${message.endpointId}`,
    metadata: {
      workspace_id: args.workspaceId,
      delivery_id: message.messageId,
      endpoint_id: message.endpointId,
      event: message.event,
      replays: message.replays + 1,
    },
  })
  const queued = (await findOutboxMessage(args.workspaceId, args.deliveryId)) ?? message
  return { replayed: true, delivery: toDelivery(queued, []) }
}

/** How long settled deliveries and their attempts are kept. */
export const OUTGOING_WEBHOOK_RETENTION_DAYS = 30

/** Delete settled deliveries and attempts older than the retention. */
export async function purgeOldOutgoingWebhooks(now: Date = new Date()): Promise<void> {
  const before = new Date(now.getTime() - OUTGOING_WEBHOOK_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  await purgeSettledOutboxMessages(before)
  await new PostgresDeliveryLedger(pool).purgeBefore(Math.floor(before.getTime() / 1000))
}
