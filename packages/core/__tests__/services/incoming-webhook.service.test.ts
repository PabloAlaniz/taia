import { createHmac } from 'node:crypto'
import { MemoryIdempotencyStore } from 'omniwebhook'
import { Webhook } from 'standardwebhooks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testWebhookSecret } from '../helpers/webhook-secret'
import {
  handleIncomingWebhook,
  IncomingWebhookError,
  type IncomingWebhookRequest,
} from '@taia/core/services/incoming-webhook.service'

const mockGetSetting = vi.fn()
const mockLogActivity = vi.fn()
const mockGetTaskById = vi.fn()
const mockUpdateTask = vi.fn()

vi.mock('@taia/core/db/repositories/setting.repository', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
}))

const mockGetWorkspaceColumns = vi.fn(async (_workspaceId: string) => [] as Array<{ slug: string }>)

vi.mock('@taia/core/services/workspace.service', () => ({
  getWorkspaceColumns: (workspaceId: string) => mockGetWorkspaceColumns(workspaceId),
}))

vi.mock('@taia/core/db', () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
  getTaskById: (...args: unknown[]) => mockGetTaskById(...args),
  updateTask: (...args: unknown[]) => mockUpdateTask(...args),
}))

// Synthetic secret, only for these tests.
const SECRET = testWebhookSecret()
const OTHER_SECRET = testWebhookSecret()
const NOW = 1_800_000_000
const clock = { now: () => NOW }

/** A delivery signed the Standard Webhooks way, as TAIA's docs ask senders to. */
function standardRequest(
  payload: unknown,
  id = 'msg_1',
  options: { timestamp?: number; secret?: string } = {},
): IncomingWebhookRequest {
  const body = JSON.stringify(payload)
  const timestamp = options.timestamp ?? NOW
  const signature = new Webhook(options.secret ?? SECRET).sign(id, new Date(timestamp * 1000), body)
  return {
    headers: [
      ['webhook-id', id],
      ['webhook-timestamp', String(timestamp)],
      ['webhook-signature', signature],
      ['content-type', 'application/json'],
    ],
    query: [],
    body: new TextEncoder().encode(body),
  }
}

/** A delivery signed exactly like GitHub does: HMAC-SHA256 of the body, no timestamp. */
function githubRequest(event: string, payload: unknown, delivery = 'gh-1'): IncomingWebhookRequest {
  const body = JSON.stringify(payload)
  const signature = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`
  return {
    headers: [
      ['x-github-event', event],
      ['x-github-delivery', delivery],
      ['x-hub-signature-256', signature],
    ],
    query: [],
    body: new TextEncoder().encode(body),
  }
}

let store: MemoryIdempotencyStore

function receive(
  request: IncomingWebhookRequest,
  extra: { dryRun?: boolean; workspaceId?: string } = {},
) {
  return handleIncomingWebhook({
    workspaceId: extra.workspaceId ?? 'ws-1',
    request,
    dryRun: extra.dryRun,
    store,
    clock,
  })
}

async function rejection(promise: Promise<unknown>): Promise<IncomingWebhookError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  if (!(error instanceof IncomingWebhookError))
    throw new Error(`expected a rejection, got ${error}`)
  return error
}

describe('handleIncomingWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store = new MemoryIdempotencyStore()
    mockGetTaskById.mockResolvedValue(undefined)
    mockUpdateTask.mockResolvedValue(null)
    mockGetSetting.mockImplementation(async (key: string) =>
      key === 'webhooks.incoming.ws-1.secret' || key === 'webhooks.incoming.ws-2.secret'
        ? SECRET
        : null,
    )
  })

  it('accepts a Standard Webhooks delivery and logs it', async () => {
    const result = await receive(standardRequest({ type: 'task.updated', title: 'Webhook test' }))

    expect(result).toMatchObject({
      accepted: true,
      duplicate: false,
      deliveryId: 'msg_1',
      event: 'task.updated',
      provider: 'taia',
    })
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'webhook.incoming',
        agent_id: 'system',
        workspace_id: 'ws-1',
        message: 'Incoming webhook accepted: task.updated (msg_1)',
      }),
    )
  })

  it('does not process the same delivery twice', async () => {
    await receive(standardRequest({ type: 'task.updated' }))
    vi.clearAllMocks()

    const result = await receive(standardRequest({ type: 'task.updated' }))

    expect(result).toMatchObject({ accepted: false, duplicate: true, deliveryId: 'msg_1' })
    expect(mockLogActivity).toHaveBeenCalledTimes(1)
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'webhook.duplicate',
        message: expect.stringContaining('ignored'),
      }),
    )
  })

  it('keeps event ids apart per workspace', async () => {
    await receive(standardRequest({ type: 'task.updated' }), { workspaceId: 'ws-1' })

    const result = await receive(standardRequest({ type: 'task.updated' }), { workspaceId: 'ws-2' })

    expect(result).toMatchObject({ accepted: true, duplicate: false, workspaceId: 'ws-2' })
  })

  it('without a configured secret answers 428', async () => {
    const error = await rejection(receive(standardRequest({}), { workspaceId: 'ws-sin-secreto' }))

    expect(error).toMatchObject({ status: 428, code: 'WEBHOOK_SECRET_NOT_CONFIGURED' })
  })

  it('a secret Standard Webhooks cannot use is a configuration problem, not a bad signature', async () => {
    mockGetSetting.mockResolvedValue('not base64 at all!')

    const error = await rejection(receive(standardRequest({})))

    expect(error).toMatchObject({ status: 428, code: 'WEBHOOK_SECRET_NOT_CONFIGURED' })
  })

  it.each([
    [
      'signed with another secret',
      () => standardRequest({}, 'msg_1', { secret: OTHER_SECRET }),
      401,
      'INVALID_SIGNATURE',
    ],
    ['too old', () => standardRequest({}, 'msg_1', { timestamp: NOW - 301 }), 401, 'STALE_WEBHOOK'],
    [
      'unsigned',
      () => ({ headers: [], query: [], body: new TextEncoder().encode('{}') }),
      401,
      'MISSING_SIGNATURE',
    ],
  ] as const)(
    'rejects a delivery %s without touching anything',
    async (_name, build, status, code) => {
      const error = await rejection(receive(build() as IncomingWebhookRequest))

      expect(error).toMatchObject({ status, code })
      expect(mockLogActivity).not.toHaveBeenCalled()
    },
  )

  it('rejects a body that is not a JSON object and frees the event for a fixed retry', async () => {
    const request = standardRequest({})
    const broken = { ...request, body: new TextEncoder().encode('[not json') }
    // The signature covers the body, so sign the broken one.
    const signature = new Webhook(SECRET).sign('msg_1', new Date(NOW * 1000), '[not json')
    const signed = {
      ...broken,
      headers: broken.headers.map(
        ([k, v]) => [k, k === 'webhook-signature' ? signature : v] as [string, string],
      ),
    }

    const error = await rejection(receive(signed))

    expect(error).toMatchObject({ status: 400, code: 'INVALID_JSON' })
    expect((await receive(standardRequest({ type: 'ok' }))).accepted).toBe(true)
  })

  it('a dry run verifies and reports, but does not reserve the event', async () => {
    const dry = await receive(standardRequest({ type: 'task.updated' }), { dryRun: true })
    const real = await receive(standardRequest({ type: 'task.updated' }))

    expect(dry).toMatchObject({ accepted: true, dryRun: true })
    expect(real).toMatchObject({ accepted: true, duplicate: false })
  })

  it('a dry run still checks the signature', async () => {
    const forged = standardRequest({}, 'msg_1', {
      secret: OTHER_SECRET,
    })

    expect(await rejection(receive(forged, { dryRun: true }))).toMatchObject({
      code: 'INVALID_SIGNATURE',
    })
  })

  it('accepts a delivery signed exactly like GitHub signs it', async () => {
    const result = await receive(githubRequest('push', { commits: [] }))

    expect(result).toMatchObject({ accepted: true, provider: 'github', deliveryId: 'gh-1' })
  })

  it('rejects a GitHub delivery with a forged signature', async () => {
    const request = githubRequest('push', { commits: [] })
    const forged = {
      ...request,
      headers: request.headers.map(
        ([k, v]) =>
          [k, k === 'x-hub-signature-256' ? `sha256=${'0'.repeat(64)}` : v] as [string, string],
      ),
    }

    expect(await rejection(receive(forged))).toMatchObject({
      status: 401,
      code: 'INVALID_SIGNATURE',
    })
  })

  it('normalizes a signed GitHub issue close into an auditable task transition', async () => {
    const rawBody = JSON.stringify({
      action: 'closed',
      issue: {
        title: 'Fix bug task:1790210227248-vjik8p',
        body: 'tracked by TAIA task 1790210227248-vjik8p',
        html_url: 'https://github.test/acme/repo/issues/7',
      },
    })
    mockGetTaskById.mockResolvedValue({
      id: '1790210227248-vjik8p',
      status: 'IN_PROGRESS',
      workspace_id: 'ws-1',
    })
    mockUpdateTask.mockResolvedValue({
      id: '1790210227248-vjik8p',
      status: 'DONE',
      workspace_id: 'ws-1',
    })

    const result = await receive(githubRequest('issues', JSON.parse(rawBody), 'github-delivery-1'))

    expect(result).toMatchObject({
      accepted: true,
      duplicate: false,
      provider: 'github',
      event: 'github.issues.closed',
      taskId: '1790210227248-vjik8p',
      transition: { from: 'IN_PROGRESS', to: 'DONE', applied: true },
    })
    expect(mockUpdateTask).toHaveBeenCalledWith('1790210227248-vjik8p', { status: 'DONE' })
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'webhook.github.transition',
        task_id: '1790210227248-vjik8p',
      }),
    )
  })

  it('records but does not apply a GitHub transition to a column the board lacks', async () => {
    const rawBody = JSON.stringify({
      action: 'closed',
      issue: { title: 'Fix task:1790210227248-vjik8p' },
    })
    mockGetWorkspaceColumns.mockResolvedValueOnce([{ slug: 'LEAD' }, { slug: 'CERRADO_GANADO' }])
    mockGetTaskById.mockResolvedValue({
      id: '1790210227248-vjik8p',
      status: 'LEAD',
      workspace_id: 'ws-1',
    })

    const result = await receive(githubRequest('issues', JSON.parse(rawBody), 'github-delivery-9'))

    expect(result).toMatchObject({ transition: { from: 'LEAD', to: 'DONE', applied: false } })
    expect(mockUpdateTask).not.toHaveBeenCalled()
  })

  it('keeps GitHub dry-run diagnostics auditable without mutating the linked task', async () => {
    const rawBody = JSON.stringify({
      action: 'opened',
      dry_run: true,
      pull_request: { title: 'Implements task:1790210227248-vjik8p' },
    })
    mockGetTaskById.mockResolvedValue({
      id: '1790210227248-vjik8p',
      status: 'IN_PROGRESS',
      workspace_id: 'ws-1',
    })

    const result = await receive(
      githubRequest('pull_request', JSON.parse(rawBody), 'github-delivery-2'),
    )

    expect(result).toMatchObject({
      provider: 'github',
      dryRun: true,
      transition: { from: 'IN_PROGRESS', to: 'REVIEW', applied: false },
    })
    expect(mockUpdateTask).not.toHaveBeenCalled()
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'webhook.github.dry_run' }),
    )
  })

  it('records unlinked GitHub payloads as audit-only diagnostics', async () => {
    const rawBody = JSON.stringify({ action: 'push', commits: [{ message: 'No task link' }] })

    const result = await receive(githubRequest('push', JSON.parse(rawBody), 'github-delivery-3'))

    expect(result).toMatchObject({
      provider: 'github',
      event: 'github.push.push',
      diagnostic: expect.stringContaining('no explicit TAIA task link'),
    })
    expect(mockUpdateTask).not.toHaveBeenCalled()
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'webhook.github.unlinked' }),
    )
  })
})
