import * as JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceBackupSnapshot,
  createWorkspaceBackupZip,
  listDueWorkspaceBackupSnapshotSchedules,
  nextWorkspaceBackupSnapshotAt,
  planWorkspaceBackupSnapshotRetention,
  preflightRestoreWorkspaceBackupZip,
  restoreWorkspaceBackupZip,
  stableJson,
  verifyWorkspaceBackupSnapshot,
} from '@taia/core/services/workspace-backup.service'

const WORKSPACE_ID = 'ws-backup-test'
const JSZipClass = ((JSZip as unknown as { default?: typeof JSZip }).default ??
  JSZip) as unknown as {
  new (): JSZip
  loadAsync(data: Buffer | Uint8Array): Promise<JSZip>
}

async function mutateZipEntry(buffer: Buffer, path: string, nextContent: string): Promise<Buffer> {
  const zip = await JSZipClass.loadAsync(buffer)
  zip.file(path, nextContent)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

describe('workspace backup manifest and restore preflight', () => {
  it('creates a ZIP manifest with checksums and accepts a valid restore preflight', async () => {
    const backup = await createWorkspaceBackupZip({
      workspaceId: WORKSPACE_ID,
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
      entities: [
        { name: 'tasks', data: [{ id: 'task-1', title: 'Keep me', workspace_id: WORKSPACE_ID }] },
        { name: 'messages', data: [{ id: 'msg-1', task_id: 'task-1', content: 'hello' }] },
      ],
    })

    const zip = await JSZipClass.loadAsync(backup)
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))

    expect(manifest).toMatchObject({
      schema_version: 1,
      workspace_id: WORKSPACE_ID,
      created_at: '2026-09-24T00:00:00.000Z',
    })
    expect(manifest.entities).toHaveLength(2)
    expect(manifest.entities.map((entry: any) => entry.path)).toEqual([
      'entities/messages.json',
      'entities/tasks.json',
    ])

    const preflight = await preflightRestoreWorkspaceBackupZip({
      backup,
      targetWorkspaceId: WORKSPACE_ID,
    })

    expect(preflight.ok).toBe(true)
    if (preflight.ok) {
      expect(preflight.diagnostics[0]).toContain('Backup preflight ok')
    }
  })

  it('rejects a ZIP when an entity hash changes without updating the manifest', async () => {
    const backup = await createWorkspaceBackupZip({
      workspaceId: WORKSPACE_ID,
      entities: [{ name: 'tasks', data: [{ id: 'task-1', title: 'original' }] }],
    })
    const tampered = await mutateZipEntry(
      backup,
      'entities/tasks.json',
      stableJson([{ id: 'task-1', title: 'tampered' }]),
    )

    const preflight = await preflightRestoreWorkspaceBackupZip({
      backup: tampered,
      targetWorkspaceId: WORKSPACE_ID,
    })

    expect(preflight.ok).toBe(false)
    expect(preflight.diagnostics.join('\n')).toContain('Hash mismatch for entities/tasks.json')
  })

  it('rejects incompatible schema versions before restore persistence is called', async () => {
    const backup = await createWorkspaceBackupZip({
      workspaceId: WORKSPACE_ID,
      entities: [{ name: 'tasks', data: [] }],
    })
    const zip = await JSZipClass.loadAsync(backup)
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    manifest.schema_version = 999
    zip.file('manifest.json', stableJson(manifest))
    const incompatible = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    const adapter = { restoreWorkspaceBackup: vi.fn() }

    const result = await restoreWorkspaceBackupZip({
      backup: incompatible,
      targetWorkspaceId: WORKSPACE_ID,
      adapter,
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics.join('\n')).toContain('Unsupported backup schema_version 999')
    expect(adapter.restoreWorkspaceBackup).not.toHaveBeenCalled()
  })

  it('rejects restoring a valid backup into a different workspace without persisting', async () => {
    const backup = await createWorkspaceBackupZip({
      workspaceId: WORKSPACE_ID,
      entities: [{ name: 'tasks', data: [] }],
    })
    const adapter = { restoreWorkspaceBackup: vi.fn() }

    const result = await restoreWorkspaceBackupZip({
      backup,
      targetWorkspaceId: 'another-workspace',
      adapter,
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics.join('\n')).toContain(
      'Workspace mismatch: backup is for ws-backup-test, target is another-workspace',
    )
    expect(adapter.restoreWorkspaceBackup).not.toHaveBeenCalled()
  })

  it('creates a verifiable snapshot inventory entry for a workspace backup', async () => {
    const { snapshot, backup } = await createWorkspaceBackupSnapshot({
      workspaceId: WORKSPACE_ID,
      createdAt: new Date('2026-09-24T03:00:00.000Z'),
      snapshotId: 'snapshot-1',
      entities: [{ name: 'tasks', data: [{ id: 'task-1', workspace_id: WORKSPACE_ID }] }],
    })

    expect(snapshot).toMatchObject({
      id: 'snapshot-1',
      workspace_id: WORKSPACE_ID,
      created_at: '2026-09-24T03:00:00.000Z',
      file_name: 'ws-backup-test-2026-09-24T03-00-00.000Z.zip',
    })
    expect(snapshot.backup_bytes).toBe(backup.byteLength)
    expect(snapshot.backup_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(snapshot.integrity.ok).toBe(true)

    const verified = await verifyWorkspaceBackupSnapshot({ snapshot, backup })
    expect(verified.ok).toBe(true)
    expect(verified.diagnostics[0]).toContain('Snapshot verified for workspace ws-backup-test')
  })

  it('detects snapshot archive tampering before restore preflight is trusted', async () => {
    const { snapshot, backup } = await createWorkspaceBackupSnapshot({
      workspaceId: WORKSPACE_ID,
      entities: [{ name: 'tasks', data: [{ id: 'task-1', title: 'original' }] }],
    })
    const tampered = await mutateZipEntry(
      backup,
      'entities/tasks.json',
      stableJson([{ id: 'task-1', title: 'tampered' }]),
    )

    const verified = await verifyWorkspaceBackupSnapshot({ snapshot, backup: tampered })

    expect(verified.ok).toBe(false)
    expect(verified.diagnostics.join('\n')).toContain('Snapshot archive hash mismatch')
    expect(verified.diagnostics.join('\n')).toContain('Hash mismatch for entities/tasks.json')
  })

  it('calculates due schedules using explicit next run or last snapshot interval', () => {
    const now = new Date('2026-09-24T04:00:00.000Z')

    expect(
      nextWorkspaceBackupSnapshotAt({
        intervalMinutes: 60,
        lastSnapshotAt: '2026-09-24T03:00:00.000Z',
      }),
    ).toBe('2026-09-24T04:00:00.000Z')
    expect(
      listDueWorkspaceBackupSnapshotSchedules(
        [
          {
            workspaceId: WORKSPACE_ID,
            enabled: true,
            intervalMinutes: 60,
            retentionCount: 2,
            nextSnapshotAt: '2026-09-24T04:00:00.000Z',
          },
          {
            workspaceId: 'not-yet',
            enabled: true,
            intervalMinutes: 60,
            retentionCount: 2,
            nextSnapshotAt: '2026-09-24T04:01:00.000Z',
          },
          {
            workspaceId: 'disabled',
            enabled: false,
            intervalMinutes: 60,
            retentionCount: 2,
            nextSnapshotAt: '2026-09-24T03:00:00.000Z',
          },
        ],
        now,
      ).map((schedule) => schedule.workspaceId),
    ).toEqual([WORKSPACE_ID])
  })

  it('plans retention only within the target workspace and keeps newest snapshots', async () => {
    const snapshots = await Promise.all(
      [
        ['old', WORKSPACE_ID, '2026-09-24T01:00:00.000Z'],
        ['newest', WORKSPACE_ID, '2026-09-24T03:00:00.000Z'],
        ['middle', WORKSPACE_ID, '2026-09-24T02:00:00.000Z'],
        ['other-workspace', 'other-workspace', '2026-09-24T00:00:00.000Z'],
      ].map(
        async ([id, workspaceId, createdAt]) =>
          (
            await createWorkspaceBackupSnapshot({
              workspaceId,
              createdAt: new Date(createdAt),
              snapshotId: id,
              entities: [{ name: 'tasks', data: [] }],
            })
          ).snapshot,
      ),
    )

    const plan = planWorkspaceBackupSnapshotRetention({
      workspaceId: WORKSPACE_ID,
      snapshots,
      retentionCount: 2,
    })

    expect(plan.kept.map((snapshot) => snapshot.id)).toEqual(['newest', 'middle'])
    expect(plan.delete.map((snapshot) => snapshot.id)).toEqual(['old'])
  })
})
