import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Task, TaskStatus } from '@taia/types'
import { getTaskById, logActivity, updateTask } from '../db'
import { getSetting, setSetting } from '../db/repositories/setting.repository'

export const INCOMING_WEBHOOK_REPLAY_WINDOW_SECONDS = 5 * 60
export const INCOMING_WEBHOOK_DEDUPE_TTL_SECONDS = 24 * 60 * 60

export interface IncomingWebhookHeaders {
  id?: string | null
  signature?: string | null
  timestamp?: string | null
  githubEvent?: string | null
}

export interface IncomingWebhookPayload {
  event?: string
  action?: string
  delivery_id?: string
  deliveryId?: string
  id?: string
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

interface DeliveryRecord {
  firstSeenAt: string
  event: string
  signature: string
}

type DeliveryLedger = Record<string, DeliveryRecord>

interface NormalizedGitHubEvent {
  provider: 'github'
  event: string
  action: string
  taskId?: string
  targetStatus?: TaskStatus
  reason: string
  sourceUrl?: string
}

function secretKey(workspaceId: string): string {
  return `webhooks.incoming.${workspaceId}.secret`
}

function deliveriesKey(workspaceId: string): string {
  return `webhooks.incoming.${workspaceId}.deliveries`
}

function normalizeSignature(signature: string): string {
  return signature.trim().startsWith('sha256=')
    ? signature.trim().slice('sha256='.length)
    : signature.trim()
}

function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(normalizeSignature(actual), 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}

function parseLedger(value: string | null): DeliveryLedger {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as DeliveryLedger
  } catch {
    return {}
  }
}

function pruneLedger(ledger: DeliveryLedger, now: Date): DeliveryLedger {
  const threshold = now.getTime() - INCOMING_WEBHOOK_DEDUPE_TTL_SECONDS * 1000
  return Object.fromEntries(
    Object.entries(ledger).filter(
      ([, record]) => new Date(record.firstSeenAt).getTime() >= threshold,
    ),
  )
}

function resolveDeliveryId(
  headers: IncomingWebhookHeaders,
  payload: IncomingWebhookPayload,
): string {
  const id = headers.id || payload.delivery_id || payload.deliveryId || payload.id
  return typeof id === 'string' && id.trim() ? id.trim() : ''
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
  headers: IncomingWebhookHeaders,
  payload: IncomingWebhookPayload,
): NormalizedGitHubEvent | null {
  const event = firstString(headers.githubEvent)
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

export function verifyIncomingWebhookSignature(args: {
  secret: string
  rawBody: string
  timestamp: string | null | undefined
  signature: string | null | undefined
  now?: Date
}): { ok: true } | { ok: false; status: number; code: string; error: string } {
  if (!args.timestamp) {
    return { ok: false, status: 400, code: 'MISSING_TIMESTAMP', error: 'Missing webhook timestamp' }
  }
  if (!args.signature) {
    return { ok: false, status: 401, code: 'MISSING_SIGNATURE', error: 'Missing webhook signature' }
  }

  const seconds = Number(args.timestamp)
  if (!Number.isFinite(seconds)) {
    return { ok: false, status: 400, code: 'INVALID_TIMESTAMP', error: 'Invalid webhook timestamp' }
  }

  const now = args.now ?? new Date()
  const ageSeconds = Math.abs(now.getTime() / 1000 - seconds)
  if (ageSeconds > INCOMING_WEBHOOK_REPLAY_WINDOW_SECONDS) {
    return {
      ok: false,
      status: 401,
      code: 'STALE_WEBHOOK',
      error: 'Webhook timestamp is outside replay window',
    }
  }

  const expected = signPayload(args.secret, args.timestamp, args.rawBody)
  if (!signaturesMatch(args.signature, expected)) {
    return { ok: false, status: 401, code: 'INVALID_SIGNATURE', error: 'Invalid webhook signature' }
  }

  return { ok: true }
}

export async function handleIncomingWebhook(args: {
  workspaceId: string
  rawBody: string
  payload: IncomingWebhookPayload
  headers: IncomingWebhookHeaders
  now?: Date
  dryRun?: boolean
}): Promise<IncomingWebhookResult> {
  const workspaceId = args.workspaceId.trim()
  if (!workspaceId) throw new Error('workspaceId is required')

  const secret = await getSetting(secretKey(workspaceId))
  if (!secret) {
    const error = new Error(
      `Incoming webhook secret is not configured for workspace ${workspaceId}`,
    )
    ;(error as Error & { status?: number; code?: string }).status = 428
    ;(error as Error & { status?: number; code?: string }).code = 'WEBHOOK_SECRET_NOT_CONFIGURED'
    throw error
  }

  const verified = verifyIncomingWebhookSignature({
    secret,
    rawBody: args.rawBody,
    timestamp: args.headers.timestamp,
    signature: args.headers.signature,
    now: args.now,
  })
  if (verified.ok === false) {
    const error = new Error(verified.error)
    ;(error as Error & { status?: number; code?: string }).status = verified.status
    ;(error as Error & { status?: number; code?: string }).code = verified.code
    throw error
  }

  const deliveryId = resolveDeliveryId(args.headers, args.payload)
  if (!deliveryId) {
    const error = new Error('Missing webhook delivery id')
    ;(error as Error & { status?: number; code?: string }).status = 400
    ;(error as Error & { status?: number; code?: string }).code = 'MISSING_DELIVERY_ID'
    throw error
  }

  const normalizedGitHub = normalizeGitHubEvent(args.headers, args.payload)
  const event =
    normalizedGitHub?.event ||
    (typeof args.payload.event === 'string'
      ? args.payload.event
      : typeof args.payload.action === 'string'
        ? args.payload.action
        : 'incoming_webhook')
  const dryRun = Boolean(args.dryRun || args.payload.dry_run || args.payload.dryRun)

  const now = args.now ?? new Date()
  const ledger = pruneLedger(parseLedger(await getSetting(deliveriesKey(workspaceId))), now)
  if (ledger[deliveryId]) {
    await logActivity({
      type: 'webhook.duplicate',
      agent_id: 'system',
      task_id: normalizedGitHub?.taskId || firstString(args.payload.task_id, args.payload.taskId),
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
      dryRun,
      taskId: normalizedGitHub?.taskId,
    }
  }

  ledger[deliveryId] = {
    firstSeenAt: now.toISOString(),
    event,
    signature: normalizeSignature(args.headers.signature || ''),
  }
  await setSetting(deliveriesKey(workspaceId), JSON.stringify(ledger))

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
    task_id:
      githubOutcome.taskId ||
      (typeof args.payload.task_id === 'string'
        ? args.payload.task_id
        : typeof args.payload.taskId === 'string'
          ? args.payload.taskId
          : undefined),
    message: `Incoming webhook accepted: ${event} (${deliveryId})`,
    metadata: {
      workspace_id: workspaceId,
      delivery_id: deliveryId,
      event,
      provider: normalizedGitHub ? 'github' : 'taia',
      dry_run: dryRun,
      title: typeof args.payload.title === 'string' ? args.payload.title : undefined,
      message: typeof args.payload.message === 'string' ? args.payload.message : undefined,
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
