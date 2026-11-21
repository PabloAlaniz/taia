import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleIncomingWebhook,
  verifyIncomingWebhookSignature,
} from '@taia/core/services/incoming-webhook.service'

const mockGetSetting = vi.fn()
const mockSetSetting = vi.fn()
const mockLogActivity = vi.fn()
const mockGetTaskById = vi.fn()
const mockUpdateTask = vi.fn()

vi.mock('@taia/core/db/repositories/setting.repository', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
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

function signature(secret: string, timestamp: string, rawBody: string) {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`
}

describe('verifyIncomingWebhookSignature', () => {
  it('accepts a fresh HMAC SHA-256 signature over timestamp.rawBody', () => {
    const rawBody = JSON.stringify({ event: 'push' })
    const timestamp = '1800000000'
    expect(
      verifyIncomingWebhookSignature({
        secret: 'top-secret',
        rawBody,
        timestamp,
        signature: signature('top-secret', timestamp, rawBody),
        now: new Date(Number(timestamp) * 1000),
      }),
    ).toEqual({ ok: true })
  })

  it('rejects stale deliveries as replay attempts', () => {
    const result = verifyIncomingWebhookSignature({
      secret: 'top-secret',
      rawBody: '{}',
      timestamp: '1800000000',
      signature: signature('top-secret', '1800000000', '{}'),
      now: new Date((1800000000 + 301) * 1000),
    })

    expect(result).toMatchObject({ ok: false, code: 'STALE_WEBHOOK', status: 401 })
  })
})

describe('handleIncomingWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTaskById.mockResolvedValue(undefined)
    mockUpdateTask.mockResolvedValue(null)
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key.endsWith('.secret')) return 'top-secret'
      if (key.endsWith('.deliveries')) return null
      return null
    })
  })

  it('persists the delivery id and logs accepted activity for valid payloads', async () => {
    const rawBody = JSON.stringify({ event: 'task.updated', title: 'Webhook test' })
    const timestamp = '1800000000'

    const result = await handleIncomingWebhook({
      workspaceId: 'ws-1',
      rawBody,
      payload: { event: 'task.updated', title: 'Webhook test' },
      headers: {
        id: 'delivery-1',
        timestamp,
        signature: signature('top-secret', timestamp, rawBody),
      },
      now: new Date(Number(timestamp) * 1000),
    })

    expect(result).toMatchObject({ accepted: true, duplicate: false, deliveryId: 'delivery-1' })
    expect(mockSetSetting).toHaveBeenCalledWith(
      'webhooks.incoming.ws-1.deliveries',
      expect.stringContaining('delivery-1'),
    )
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'webhook.incoming',
        agent_id: 'system',
        workspace_id: 'ws-1',
        message: 'Incoming webhook accepted: task.updated (delivery-1)',
      }),
    )
  })

  it('does not process the same delivery id twice', async () => {
    const rawBody = JSON.stringify({ event: 'task.updated' })
    const timestamp = '1800000000'
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key.endsWith('.secret')) return 'top-secret'
      if (key.endsWith('.deliveries')) {
        return JSON.stringify({
          'delivery-1': {
            firstSeenAt: new Date(Number(timestamp) * 1000).toISOString(),
            event: 'task.updated',
            signature: 'abc',
          },
        })
      }
      return null
    })

    const result = await handleIncomingWebhook({
      workspaceId: 'ws-1',
      rawBody,
      payload: { event: 'task.updated' },
      headers: {
        id: 'delivery-1',
        timestamp,
        signature: signature('top-secret', timestamp, rawBody),
      },
      now: new Date(Number(timestamp) * 1000),
    })

    expect(result).toMatchObject({ accepted: false, duplicate: true })
    expect(mockSetSetting).not.toHaveBeenCalled()
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'webhook.duplicate',
        message: expect.stringContaining('ignored'),
      }),
    )
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
    const timestamp = '1800000000'
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

    const result = await handleIncomingWebhook({
      workspaceId: 'ws-1',
      rawBody,
      payload: JSON.parse(rawBody),
      headers: {
        id: 'github-delivery-1',
        githubEvent: 'issues',
        timestamp,
        signature: signature('top-secret', timestamp, rawBody),
      },
      now: new Date(Number(timestamp) * 1000),
    })

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
    const timestamp = '1800000000'
    mockGetWorkspaceColumns.mockResolvedValueOnce([{ slug: 'LEAD' }, { slug: 'CERRADO_GANADO' }])
    mockGetTaskById.mockResolvedValue({
      id: '1790210227248-vjik8p',
      status: 'LEAD',
      workspace_id: 'ws-1',
    })

    const result = await handleIncomingWebhook({
      workspaceId: 'ws-1',
      rawBody,
      payload: JSON.parse(rawBody),
      headers: {
        id: 'github-delivery-9',
        githubEvent: 'issues',
        timestamp,
        signature: signature('top-secret', timestamp, rawBody),
      },
      now: new Date(Number(timestamp) * 1000),
    })

    expect(result).toMatchObject({ transition: { from: 'LEAD', to: 'DONE', applied: false } })
    expect(mockUpdateTask).not.toHaveBeenCalled()
  })

  it('keeps GitHub dry-run diagnostics auditable without mutating the linked task', async () => {
    const rawBody = JSON.stringify({
      action: 'opened',
      dry_run: true,
      pull_request: { title: 'Implements task:1790210227248-vjik8p' },
    })
    const timestamp = '1800000000'
    mockGetTaskById.mockResolvedValue({
      id: '1790210227248-vjik8p',
      status: 'IN_PROGRESS',
      workspace_id: 'ws-1',
    })

    const result = await handleIncomingWebhook({
      workspaceId: 'ws-1',
      rawBody,
      payload: JSON.parse(rawBody),
      headers: {
        id: 'github-delivery-2',
        githubEvent: 'pull_request',
        timestamp,
        signature: signature('top-secret', timestamp, rawBody),
      },
      now: new Date(Number(timestamp) * 1000),
    })

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
    const timestamp = '1800000000'

    const result = await handleIncomingWebhook({
      workspaceId: 'ws-1',
      rawBody,
      payload: JSON.parse(rawBody),
      headers: {
        id: 'github-delivery-3',
        githubEvent: 'push',
        timestamp,
        signature: signature('top-secret', timestamp, rawBody),
      },
      now: new Date(Number(timestamp) * 1000),
    })

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
