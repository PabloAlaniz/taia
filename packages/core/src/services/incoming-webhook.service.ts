import type { Task, TaskStatus } from '@taia/types'
import {
  type Clock,
  createReceiver,
  githubScheme,
  httpStatusFor,
  type IdempotencyStore,
  type IncomingRequest,
  type Rejection,
  type Verifier,
} from 'omniwebhook'
import { standardScheme } from 'omniwebhook/standard'
import { getTaskById, logActivity, updateTask } from '../db'
import { getSetting } from '../db/repositories/setting.repository'
import { incomingWebhookStore } from '../webhook-store'

/**
 * A raw incoming webhook: headers (lowercase names), query string and the body
 * exactly as it arrived. The signature is checked over these bytes, so the
 * body must not be decoded or re-encoded before it gets here.
 */
export type IncomingWebhookRequest = IncomingRequest

export interface IncomingWebhookPayload {
  type?: string
  event?: string
  action?: string
  task_id?: string
  taskId?: string
  title?: string
  message?: string
  dry_run?: boolean
  dryRun?: boolean
  issue?: GitHubIssueLike
  pull_request?: GitHubPullRequestLike
  commits?: Array<{ message?: string | null }>
  ref?: string
  [key: string]: unknown
}

interface GitHubIssueLike {
  title?: string | null
  body?: string | null
  state?: string | null
  html_url?: string | null
  number?: number | null
}

interface GitHubPullRequestLike extends GitHubIssueLike {
  merged?: boolean | null
}

export interface IncomingWebhookResult {
  ok: true
  accepted: boolean
  duplicate: boolean
  deliveryId: string
  event: string
  workspaceId: string
  provider?: 'github' | 'taia'
  dryRun?: boolean
  taskId?: string
  transition?: {
    from: string
    to: string
    applied: boolean
    reason: string
  }
  diagnostic?: string
}

interface NormalizedGitHubEvent {
  provider: 'github'
  event: string
  action: string
  taskId?: string
  targetStatus?: TaskStatus
  reason: string
  sourceUrl?: string
}

/** An error the webhook route answers with its own status and code. */
export class IncomingWebhookError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'IncomingWebhookError'
  }
}

function secretKey(workspaceId: string): string {
  return `webhooks.incoming.${workspaceId}.secret`
}

function header(request: IncomingRequest, name: string): string | undefined {
  const found = request.headers.find(([key]) => key.toLowerCase() === name)
  return found?.[1]
}

/** GitHub deliveries carry x-github-event; everything else is Standard Webhooks. */
function verifierFor(request: IncomingRequest, secret: string, clock?: Clock): Verifier {
  const config = { secrets: [secret], ...(clock ? { clock } : {}) }
  return header(request, 'x-github-event') !== undefined
    ? githubScheme(config)
    : standardScheme(config)
}

const REJECTIONS: Record<Rejection, { code: string; message: string }> = {
  unconfigured: {
    code: 'WEBHOOK_SECRET_NOT_CONFIGURED',
    message:
      'The incoming webhook secret is not usable: Standard Webhooks needs a whsec_<base64> secret',
  },
  missing: { code: 'MISSING_SIGNATURE', message: 'Missing webhook signature headers' },
  ambiguous: { code: 'AMBIGUOUS_SIGNATURE', message: 'Repeated webhook signature headers' },
  malformed: { code: 'MALFORMED_SIGNATURE', message: 'Malformed webhook signature headers' },
  invalid: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' },
  stale: { code: 'STALE_WEBHOOK', message: 'Webhook timestamp is outside the replay window' },
}

function rejected(outcome: Rejection): IncomingWebhookError {
  const { code, message } = REJECTIONS[outcome]
  // A secret that exists but cannot sign is still a configuration problem.
  const status = outcome === 'unconfigured' ? 428 : httpStatusFor(outcome)
  return new IncomingWebhookError(status, code, message)
}

function parsePayload(body: Uint8Array): IncomingWebhookPayload {
  const text = new TextDecoder().decode(body)
  if (!text.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as IncomingWebhookPayload
    }
  } catch {
    // Answered below.
  }
  throw new IncomingWebhookError(400, 'INVALID_JSON', 'Webhook body is not a JSON object')
}

/** The sender's id for this delivery, as it sent it. */
function deliveryIdOf(request: IncomingRequest, eventKey: string): string {
  return header(request, 'x-github-delivery') ?? header(request, 'webhook-id') ?? eventKey
}

function eventNameOf(normalized: NormalizedGitHubEvent | null, payload: IncomingWebhookPayload) {
  return (
    normalized?.event ||
    firstString(payload.type, payload.event, payload.action) ||
    'incoming_webhook'
  )
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function resolveLinkedTaskId(payload: IncomingWebhookPayload): string | undefined {
  const explicit = firstString(payload.task_id, payload.taskId)
  if (explicit) return explicit

  const haystack = [
    payload.title,
    payload.message,
    payload.issue?.title,
    payload.issue?.body,
    payload.pull_request?.title,
    payload.pull_request?.body,
    ...(payload.commits || []).map((commit) => commit.message),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')

  return haystack.match(/(?:taia-task|task|tarea)[:#\s]+([0-9]{10,}-[a-z0-9]+)/i)?.[1]
}

function githubTargetStatus(
  event: string,
  action: string,
  payload: IncomingWebhookPayload,
): TaskStatus | undefined {
  if (event === 'issues') {
    if (['closed'].includes(action)) return 'DONE'
    if (['reopened'].includes(action)) return 'IN_PROGRESS'
    if (['opened', 'assigned', 'labeled'].includes(action)) return 'INBOX'
  }

  if (event === 'pull_request') {
    if (action === 'closed') return payload.pull_request?.merged ? 'DONE' : 'REJECTED'
    if (
      ['opened', 'ready_for_review', 'review_requested', 'synchronize', 'reopened'].includes(action)
    ) {
      return 'REVIEW'
    }
  }

  return undefined
}

function normalizeGitHubEvent(
  githubEvent: string | undefined,
  payload: IncomingWebhookPayload,
): NormalizedGitHubEvent | null {
  const event = firstString(githubEvent)
  if (!event || !['issues', 'pull_request', 'push'].includes(event)) return null

  const action = firstString(payload.action) || (event === 'push' ? 'push' : 'unknown')
  const taskId = resolveLinkedTaskId(payload)
  const targetStatus = githubTargetStatus(event, action, payload)
  const sourceUrl = firstString(payload.issue?.html_url, payload.pull_request?.html_url)

  return {
    provider: 'github',
    event: `github.${event}.${action}`,
    action,
    taskId,
    targetStatus,
    sourceUrl,
    reason: targetStatus
      ? `GitHub ${event}.${action} maps to ${targetStatus}`
      : `GitHub ${event}.${action} is audit-only`,
  }
}

async function applyGitHubEvent(args: {
  workspaceId: string
  deliveryId: string
  normalized: NormalizedGitHubEvent
  dryRun: boolean
}): Promise<Pick<IncomingWebhookResult, 'taskId' | 'transition' | 'diagnostic'>> {
  const { workspaceId, deliveryId, normalized, dryRun } = args

  if (!normalized.taskId) {
    const diagnostic = 'GitHub payload has no explicit TAIA task link; accepted for audit only'
    await logActivity({
      type: 'webhook.github.unlinked',
      agent_id: 'system',
      workspace_id: workspaceId,
      message: `${diagnostic}: ${normalized.event} (${deliveryId})`,
      metadata: { workspace_id: workspaceId, delivery_id: deliveryId, ...normalized },
    })
    return { diagnostic }
  }

  const task = await getTaskById(normalized.taskId)
  if (!task || task.workspace_id !== workspaceId) {
    const diagnostic = `Linked task ${normalized.taskId} was not found in workspace ${workspaceId}`
    await logActivity({
      type: 'webhook.github.unresolved_task',
      agent_id: 'system',
      workspace_id: workspaceId,
      task_id: normalized.taskId,
      message: `${diagnostic}: ${normalized.event} (${deliveryId})`,
      metadata: { workspace_id: workspaceId, delivery_id: deliveryId, ...normalized },
    })
    return { taskId: normalized.taskId, diagnostic }
  }

  if (!normalized.targetStatus) {
    const diagnostic = normalized.reason
    await logActivity({
      type: 'webhook.github.audit_only',
      agent_id: 'system',
      workspace_id: workspaceId,
      task_id: task.id,
      message: `${diagnostic}: ${normalized.event} (${deliveryId})`,
      metadata: { workspace_id: workspaceId, delivery_id: deliveryId, ...normalized },
    })
    return { taskId: task.id, diagnostic }
  }

  const transition = {
    from: task.status,
    to: normalized.targetStatus,
    applied: false,
    reason: normalized.reason,
  }

  // The GitHub mapping uses Software Dev slugs (DONE, REVIEW, …). On a board
  // without that column the transition is recorded but not applied.
  const { getWorkspaceColumns } = await import('./workspace.service')
  const slugs = (await getWorkspaceColumns(task.workspace_id || workspaceId)).map((c) => c.slug)
  const columnExists = slugs.length === 0 || slugs.includes(normalized.targetStatus)
  if (!columnExists)
    transition.reason = `${transition.reason}; no ${normalized.targetStatus} column`

  if (task.status !== normalized.targetStatus && !dryRun && columnExists) {
    const updates: Partial<Task> = { status: normalized.targetStatus }
    await updateTask(task.id, updates)
    transition.applied = true
  }

  await logActivity({
    type: dryRun ? 'webhook.github.dry_run' : 'webhook.github.transition',
    agent_id: 'system',
    workspace_id: workspaceId,
    task_id: task.id,
    message: `${dryRun ? 'Dry-run' : 'Applied'} GitHub webhook transition: ${normalized.event} ${task.status} -> ${normalized.targetStatus} (${deliveryId})`,
    metadata: {
      workspace_id: workspaceId,
      delivery_id: deliveryId,
      dry_run: dryRun,
      ...normalized,
      transition,
    },
  })

  return { taskId: task.id, transition }
}

async function processEvent(args: {
  workspaceId: string
  deliveryId: string
  githubEvent: string | undefined
  payload: IncomingWebhookPayload
  dryRun: boolean
}): Promise<IncomingWebhookResult> {
  const { workspaceId, deliveryId, payload, dryRun } = args
  const normalizedGitHub = normalizeGitHubEvent(args.githubEvent, payload)
  const event = eventNameOf(normalizedGitHub, payload)

  let githubOutcome: Pick<IncomingWebhookResult, 'taskId' | 'transition' | 'diagnostic'> = {}
  if (normalizedGitHub) {
    githubOutcome = await applyGitHubEvent({
      workspaceId,
      deliveryId,
      normalized: normalizedGitHub,
      dryRun,
    })
  }

  await logActivity({
    type: 'webhook.incoming',
    agent_id: 'system',
    workspace_id: workspaceId,
    task_id: githubOutcome.taskId || firstString(payload.task_id, payload.taskId),
    message: `Incoming webhook accepted: ${event} (${deliveryId})`,
    metadata: {
      workspace_id: workspaceId,
      delivery_id: deliveryId,
      event,
      provider: normalizedGitHub ? 'github' : 'taia',
      dry_run: dryRun,
      title: typeof payload.title === 'string' ? payload.title : undefined,
      message: typeof payload.message === 'string' ? payload.message : undefined,
      ...githubOutcome,
    },
  })

  return {
    ok: true,
    accepted: true,
    duplicate: false,
    deliveryId,
    event,
    workspaceId,
    provider: normalizedGitHub ? 'github' : 'taia',
    dryRun,
    ...githubOutcome,
  }
}

/**
 * Verify an incoming webhook and apply it once. GitHub deliveries are checked
 * with GitHub's own signature (x-hub-signature-256 over the body); anything
 * else must be signed with Standard Webhooks (webhook-id, webhook-timestamp,
 * webhook-signature). Each event is reserved per workspace before it is
 * processed, so a retried or replayed delivery is reported as a duplicate.
 *
 * With `dryRun` the signature is checked and the outcome is computed, but no
 * task changes and the event is not reserved.
 */
export async function handleIncomingWebhook(args: {
  workspaceId: string
  request: IncomingWebhookRequest
  dryRun?: boolean
  store?: IdempotencyStore
  clock?: Clock
}): Promise<IncomingWebhookResult> {
  const workspaceId = args.workspaceId.trim()
  if (!workspaceId) {
    throw new IncomingWebhookError(400, 'MISSING_WORKSPACE', 'workspace_id is required')
  }

  const secret = await getSetting(secretKey(workspaceId))
  if (!secret) {
    throw new IncomingWebhookError(
      428,
      'WEBHOOK_SECRET_NOT_CONFIGURED',
      `Incoming webhook secret is not configured for workspace ${workspaceId}`,
    )
  }

  const { request } = args
  const verifier = verifierFor(request, secret, args.clock)
  const githubEvent = header(request, 'x-github-event')

  // Always verify first, whatever the request asks for: nothing below runs
  // for an unsigned or forged delivery. The receiver verifies again; it is
  // one HMAC, and it keeps the reservation tied to a verified event.
  const verification = await verifier.verify(request)
  if (verification.outcome !== 'ok') throw rejected(verification.outcome)

  if (args.dryRun) {
    return processEvent({
      workspaceId,
      deliveryId: deliveryIdOf(request, verification.eventKey),
      githubEvent,
      payload: parsePayload(request.body),
      dryRun: true,
    })
  }

  const receiver = createReceiver({
    verifier,
    store: args.store ?? incomingWebhookStore(),
    // Workspaces share the table: the same event id may reach two of them.
    eventKey: (event) => `${workspaceId}:${event.eventKey}`,
    ...(args.clock ? { clock: args.clock } : {}),
  })

  let result: IncomingWebhookResult | undefined
  const reception = await receiver.execute(request, async (event) => {
    const payload = parsePayload(event.request.body)
    result = await processEvent({
      workspaceId,
      deliveryId: deliveryIdOf(request, event.eventKey),
      githubEvent,
      payload,
      dryRun: Boolean(payload.dry_run || payload.dryRun),
    })
  })

  switch (reception.outcome) {
    case 'ok':
      if (!result) throw new Error('Webhook handler finished without a result')
      return result
    case 'duplicate':
      return duplicateOf(workspaceId, request, reception.eventKey, githubEvent)
    case 'in_progress':
      throw new IncomingWebhookError(
        409,
        'WEBHOOK_IN_PROGRESS',
        'This webhook is being processed right now; retry later',
      )
    case 'failed':
      throw reception.error
    default:
      throw rejected(reception.outcome)
  }
}

async function duplicateOf(
  workspaceId: string,
  request: IncomingRequest,
  eventKey: string,
  githubEvent: string | undefined,
): Promise<IncomingWebhookResult> {
  const deliveryId = deliveryIdOf(request, eventKey)
  // Already verified: the body is the sender's, only its name is needed here.
  let payload: IncomingWebhookPayload = {}
  try {
    payload = parsePayload(request.body)
  } catch {
    // A duplicate of a body that was never valid JSON: report it by its id only.
  }
  const normalizedGitHub = normalizeGitHubEvent(githubEvent, payload)
  const event = eventNameOf(normalizedGitHub, payload)
  const taskId = normalizedGitHub?.taskId || firstString(payload.task_id, payload.taskId)

  await logActivity({
    type: 'webhook.duplicate',
    agent_id: 'system',
    task_id: taskId,
    workspace_id: workspaceId,
    message: `Duplicate incoming webhook ignored: ${event} (${deliveryId})`,
    metadata: { workspace_id: workspaceId, delivery_id: deliveryId, event },
  })
  return {
    ok: true,
    accepted: false,
    duplicate: true,
    deliveryId,
    event,
    workspaceId,
    provider: normalizedGitHub ? 'github' : 'taia',
    dryRun: false,
    taskId,
  }
}
