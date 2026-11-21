import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupExpiredRetentionResources,
  createFilesystemRetentionAdapter,
  planRetentionCleanup,
  type RetentionResource,
} from '@taia/core/services/retention.service'

const mockLogActivity = vi.fn()
const mockPoolQuery = vi.fn()

vi.mock('@taia/core/db/repositories/activity.repository', () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}))

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}))

describe('retention.service', () => {
  const workspaceId = 'ws-retention'
  const now = new Date('2026-09-24T00:00:00.000Z')
  let tempDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    mockPoolQuery.mockReset()
    tempDir = await mkdtemp(join(tmpdir(), 'taia-retention-'))
    mockLogActivity.mockResolvedValue({ id: 'activity-1' })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('plans expired resources per workspace while preserving active resources', async () => {
    const resources: RetentionResource[] = [
      {
        id: 'old-backup.zip',
        workspace_id: workspaceId,
        type: 'workspace_backup',
        updated_at: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'fresh-qa-run',
        workspace_id: workspaceId,
        type: 'qa_artifact',
        updated_at: '2026-09-20T00:00:00.000Z',
      },
      {
        id: 'active-transcript',
        workspace_id: workspaceId,
        type: 'runtime_transcript',
        updated_at: '2026-08-01T00:00:00.000Z',
        active: true,
      },
    ]

    const result = await planRetentionCleanup(
      { workspace_id: workspaceId, now, backup_retention_days: 30, transcript_retention_days: 30 },
      { listResources: async () => resources },
    )

    expect(result.scanned).toBe(3)
    expect(result.expired.map((resource) => resource.id)).toEqual(['old-backup.zip'])
    expect(result.skipped_active.map((resource) => resource.id)).toEqual(['active-transcript'])
  })

  it('supports dry-run and idempotent cleanup with activity evidence', async () => {
    const deleted: string[] = []
    const resources: RetentionResource[] = [
      {
        id: 'old-qa-run',
        workspace_id: workspaceId,
        type: 'qa_artifact',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
    ]
    const adapter = {
      listResources: async () => resources,
      deleteResource: async (resource: RetentionResource) => {
        deleted.push(resource.id)
      },
    }

    const dryRun = await cleanupExpiredRetentionResources({
      policy: { workspace_id: workspaceId, now, qa_artifact_retention_days: 14 },
      adapter,
      dry_run: true,
      created_by: 'retention-test',
    })
    const cleanup = await cleanupExpiredRetentionResources({
      policy: { workspace_id: workspaceId, now, qa_artifact_retention_days: 14 },
      adapter,
      dry_run: false,
      created_by: 'retention-test',
    })

    expect(dryRun.deleted).toEqual([])
    expect(cleanup.deleted.map((resource) => resource.id)).toEqual(['old-qa-run'])
    expect(deleted).toEqual(['old-qa-run'])
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'retention_cleanup',
        workspace_id: workspaceId,
        message: expect.stringContaining('deleted 1'),
      }),
    )
  })

  it('cleans filesystem fixtures only inside the requested workspace roots', async () => {
    const backupRoot = join(tempDir, 'backups')
    const qaRoot = join(tempDir, 'qa')
    const transcriptRoot = join(tempDir, 'transcripts')
    const oldDate = new Date('2026-08-01T00:00:00.000Z')
    const keepDate = new Date('2026-09-23T00:00:00.000Z')

    const oldBackup = join(backupRoot, workspaceId, 'old-backup.zip')
    const freshQa = join(qaRoot, workspaceId, 'fresh-run')
    const otherWorkspaceBackup = join(backupRoot, 'other-workspace', 'old-backup.zip')
    await mkdir(dirname(oldBackup), { recursive: true })
    await mkdir(freshQa, { recursive: true })
    await mkdir(dirname(otherWorkspaceBackup), { recursive: true })
    await writeFile(oldBackup, 'old backup')
    await writeFile(join(freshQa, 'run.json'), '{}')
    await writeFile(otherWorkspaceBackup, 'other workspace')
    await utimes(oldBackup, oldDate, oldDate)
    await utimes(freshQa, keepDate, keepDate)
    await utimes(otherWorkspaceBackup, oldDate, oldDate)

    const adapter = createFilesystemRetentionAdapter({
      backupDir: backupRoot,
      qaArtifactsDir: qaRoot,
      transcriptDir: transcriptRoot,
    })
    const result = await cleanupExpiredRetentionResources({
      policy: {
        workspace_id: workspaceId,
        now,
        backup_retention_days: 30,
        qa_artifact_retention_days: 14,
      },
      adapter,
      dry_run: false,
    })

    expect(result.deleted.map((resource) => resource.id)).toEqual(['old-backup.zip'])
    await expect(stat(oldBackup)).rejects.toThrow()
    await expect(stat(join(freshQa, 'run.json'))).resolves.toBeTruthy()
    await expect(stat(otherWorkspaceBackup)).resolves.toBeTruthy()
  })

  it('plans operational retention for activities, notifications and shadow alert activities per workspace', async () => {
    const { createOperationalDataRetentionAdapter } = await import(
      '@taia/core/services/retention.service'
    )
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'act-old',
            workspace_id: workspaceId,
            type: 'task_moved',
            created_at: '2026-06-01T00:00:00.000Z',
          },
          {
            id: 'alert-old',
            workspace_id: workspaceId,
            type: 'alert',
            created_at: '2026-06-01T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'notif-old-delivered',
            workspace_id: workspaceId,
            status: 'delivered',
            created_at: '2026-06-01T00:00:00.000Z',
          },
          {
            id: 'notif-old-pending',
            workspace_id: workspaceId,
            status: 'pending',
            created_at: '2026-06-01T00:00:00.000Z',
          },
        ],
      })

    const result = await planRetentionCleanup(
      {
        workspace_id: workspaceId,
        now,
        activity_retention_days: 30,
        notification_retention_days: 30,
        shadow_alert_retention_days: 30,
      },
      createOperationalDataRetentionAdapter(),
    )

    expect(mockPoolQuery.mock.calls[0][0]).toContain('FROM activities')
    expect(mockPoolQuery.mock.calls[0][1]).toEqual([workspaceId])
    expect(mockPoolQuery.mock.calls[1][0]).toContain('INNER JOIN tasks')
    expect(result.expired.map((resource) => resource.id)).toEqual([
      'act-old',
      'alert-old',
      'notif-old-delivered',
    ])
    expect(result.skipped_active.map((resource) => resource.id)).toEqual(['notif-old-pending'])
  })

  it('deletes operational retention resources with workspace guards and pending notification protection', async () => {
    const { createOperationalDataRetentionAdapter } = await import(
      '@taia/core/services/retention.service'
    )
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'notif-old-failed',
            workspace_id: workspaceId,
            status: 'failed',
            created_at: '2026-06-01T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })

    const result = await cleanupExpiredRetentionResources({
      policy: { workspace_id: workspaceId, now, notification_retention_days: 30 },
      adapter: createOperationalDataRetentionAdapter(),
      dry_run: false,
      skip_activity_log: true,
    })

    expect(result.deleted.map((resource) => resource.id)).toEqual(['notif-old-failed'])
    expect(mockPoolQuery.mock.calls[2][0]).toContain('DELETE FROM notifications')
    expect(mockPoolQuery.mock.calls[2][0]).toContain("n.status <> 'pending'")
    expect(mockPoolQuery.mock.calls[2][1]).toEqual(['notif-old-failed', workspaceId])
  })
})
