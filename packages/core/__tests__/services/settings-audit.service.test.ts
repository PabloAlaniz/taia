import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}))

import {
  cleanupSettingsAuditEvents,
  classifySettingResource,
  isSensitiveSettingKey,
  listSettingsAuditEvents,
  recordSettingsAuditEvent,
} from '@taia/core/services/settings-audit.service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('settings-audit.service', () => {
  it('classifies API key and token settings without storing secret values', () => {
    expect(isSensitiveSettingKey('openclaw.gateway_token')).toBe(true)
    expect(isSensitiveSettingKey('anthropic.api_key')).toBe(true)
    expect(classifySettingResource('anthropic.api_key')).toBe('api_key')
    expect(classifySettingResource('ui.theme')).toBe('setting')
  })

  it('records create/update/revoke metadata scoped to workspace', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'settings-audit-1',
            workspace_id: 'ws-a',
            setting_key: 'anthropic.api_key',
            resource_type: 'api_key',
            operation: 'create',
            actor: 'test-cron',
            origin: 'test',
            result: 'success',
            message: null,
          },
        ],
      })

    const event = await recordSettingsAuditEvent({
      workspaceId: 'ws-a',
      settingKey: 'anthropic.api_key',
      operation: 'create',
      actor: 'test-cron',
      origin: 'test',
    })

    expect(event.resource_type).toBe('api_key')
    const insertArgs = mockQuery.mock.calls[3][1]
    expect(insertArgs).toEqual([
      expect.stringMatching(/^settings-audit-/),
      'ws-a',
      'anthropic.api_key',
      'api_key',
      'create',
      'test-cron',
      'test',
      'success',
      null,
    ])
  })

  it('lists audit events with workspace isolation, filters and pagination', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'event-1', workspace_id: 'ws-a' }] })

    const result = await listSettingsAuditEvents({
      workspaceId: 'ws-a',
      operation: 'revoke',
      resourceType: 'api_key',
      limit: 500,
      offset: 2,
    })

    expect(result.total).toBe(1)
    expect(result.limit).toBe(200)
    expect(result.offset).toBe(2)
    expect(mockQuery.mock.calls[3][0]).toContain(
      'workspace_id = $1 AND operation = $2 AND resource_type = $3',
    )
    expect(mockQuery.mock.calls[3][1]).toEqual(['ws-a', 'revoke', 'api_key'])
  })

  it('cleans up only one workspace according to retention days', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 3 })

    const result = await cleanupSettingsAuditEvents({ workspaceId: 'ws-a', retentionDays: 7 })

    expect(result.deleted).toBe(3)
    expect(mockQuery.mock.calls[3][0]).toContain('WHERE workspace_id = $1')
    expect(mockQuery.mock.calls[3][1]).toEqual(['ws-a', 7])
  })
})
