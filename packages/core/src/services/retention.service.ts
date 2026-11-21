import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { logActivity } from '../db/repositories/activity.repository'
import { pool } from '../db/pool'

export type RetentionResourceType =
  | 'workspace_backup'
  | 'qa_artifact'
  | 'runtime_transcript'
  | 'activity_feed'
  | 'notification'
  | 'shadow_alert'

export interface RetentionResource {
  id: string
  workspace_id: string
  type: RetentionResourceType
  path?: string
  updated_at: string
  active?: boolean
  metadata?: Record<string, unknown>
}

export interface RetentionPolicy {
  workspace_id: string
  now?: Date
  backup_retention_days?: number
  qa_artifact_retention_days?: number
  transcript_retention_days?: number
  activity_retention_days?: number
  notification_retention_days?: number
  shadow_alert_retention_days?: number
}

export interface RetentionAdapter {
  listResources(workspaceId: string): Promise<RetentionResource[]>
  deleteResource(resource: RetentionResource): Promise<void>
}

export interface RetentionCandidate extends RetentionResource {
  age_days: number
  retention_days: number
  reason: string
}

export interface RetentionCleanupResult {
  workspace_id: string
  dry_run: boolean
  scanned: number
  expired: RetentionCandidate[]
  deleted: RetentionCandidate[]
  skipped_active: RetentionResource[]
  errors: Array<{ resource_id: string; message: string }>
}

export const DEFAULT_RETENTION_POLICY_DAYS: Record<RetentionResourceType, number> = {
  workspace_backup: 30,
  qa_artifact: 14,
  runtime_transcript: 30,
  activity_feed: 90,
  notification: 90,
  shadow_alert: 90,
}

function retentionDaysFor(resource: RetentionResource, policy: RetentionPolicy): number {
  if (resource.type === 'workspace_backup') {
    return policy.backup_retention_days ?? DEFAULT_RETENTION_POLICY_DAYS.workspace_backup
  }
  if (resource.type === 'qa_artifact') {
    return policy.qa_artifact_retention_days ?? DEFAULT_RETENTION_POLICY_DAYS.qa_artifact
  }
  if (resource.type === 'runtime_transcript') {
    return policy.transcript_retention_days ?? DEFAULT_RETENTION_POLICY_DAYS.runtime_transcript
  }
  if (resource.type === 'notification') {
    return policy.notification_retention_days ?? DEFAULT_RETENTION_POLICY_DAYS.notification
  }
  if (resource.type === 'shadow_alert') {
    return policy.shadow_alert_retention_days ?? DEFAULT_RETENTION_POLICY_DAYS.shadow_alert
  }
  return policy.activity_retention_days ?? DEFAULT_RETENTION_POLICY_DAYS.activity_feed
}

function ageDays(updatedAt: string, now: Date): number {
  const updated = Date.parse(updatedAt)
  if (Number.isNaN(updated)) return 0
  return Math.max(0, Math.floor((now.getTime() - updated) / 86_400_000))
}

export async function planRetentionCleanup(
  policy: RetentionPolicy,
  adapter: Pick<RetentionAdapter, 'listResources'>,
): Promise<RetentionCleanupResult> {
  const now = policy.now ?? new Date()
  const resources = await adapter.listResources(policy.workspace_id)
  const skippedActive = resources.filter((resource) => resource.active === true)
  const expired = resources
    .filter((resource) => resource.active !== true)
    .map((resource) => {
      const retentionDays = retentionDaysFor(resource, policy)
      return {
        ...resource,
        age_days: ageDays(resource.updated_at, now),
        retention_days: retentionDays,
        reason: `${resource.type} older than ${retentionDays} day(s)`,
      }
    })
    .filter((resource) => resource.age_days >= resource.retention_days)
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id))

  return {
    workspace_id: policy.workspace_id,
    dry_run: true,
    scanned: resources.length,
    expired,
    deleted: [],
    skipped_active: skippedActive,
    errors: [],
  }
}

export async function cleanupExpiredRetentionResources(input: {
  policy: RetentionPolicy
  adapter: RetentionAdapter
  dry_run?: boolean
  created_by?: string
  skip_activity_log?: boolean
}): Promise<RetentionCleanupResult> {
  const plan = await planRetentionCleanup(input.policy, input.adapter)
  const dryRun = input.dry_run ?? true
  const result: RetentionCleanupResult = { ...plan, dry_run: dryRun, deleted: [], errors: [] }

  if (!dryRun) {
    for (const resource of plan.expired) {
      try {
        await input.adapter.deleteResource(resource)
        result.deleted.push(resource)
      } catch (error) {
        result.errors.push({
          resource_id: resource.id,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  if (!input.skip_activity_log) {
    await logActivity({
      type: 'retention_cleanup',
      agent_id: input.created_by || 'system',
      workspace_id: input.policy.workspace_id,
      message: `Retention ${dryRun ? 'dry-run' : 'cleanup'} scanned ${result.scanned} resource(s), expired ${result.expired.length}, deleted ${result.deleted.length}, errors ${result.errors.length}`,
      metadata: {
        dry_run: dryRun,
        expired: result.expired.map((resource) => ({
          id: resource.id,
          type: resource.type,
          age_days: resource.age_days,
          retention_days: resource.retention_days,
          path: resource.path,
        })),
        deleted: result.deleted.map((resource) => resource.id),
        skipped_active: result.skipped_active.map((resource) => resource.id),
        errors: result.errors,
      },
    })
  }

  return result
}

async function listDirectoryResources(input: {
  workspaceId: string
  rootDir?: string
  type: RetentionResourceType
  activeIds?: Set<string>
}): Promise<RetentionResource[]> {
  if (!input.rootDir) return []

  let entries
  try {
    entries = await readdir(input.rootDir, { withFileTypes: true })
  } catch {
    return []
  }

  const resources: RetentionResource[] = []
  for (const entry of entries) {
    const path = join(input.rootDir, entry.name)
    const info = await stat(path)
    resources.push({
      id: entry.name,
      workspace_id: input.workspaceId,
      type: input.type,
      path,
      updated_at: info.mtime.toISOString(),
      active: input.activeIds?.has(entry.name) ?? false,
      metadata: { kind: entry.isDirectory() ? 'directory' : 'file' },
    })
  }
  return resources
}

export function createFilesystemRetentionAdapter(input: {
  backupDir?: string
  qaArtifactsDir?: string
  transcriptDir?: string
  activeResourceIds?: string[]
}): RetentionAdapter {
  const activeIds = new Set(input.activeResourceIds ?? [])

  return {
    async listResources(workspaceId: string) {
      const [backups, qaArtifacts, transcripts] = await Promise.all([
        listDirectoryResources({
          workspaceId,
          rootDir: input.backupDir ? join(input.backupDir, workspaceId) : undefined,
          type: 'workspace_backup',
          activeIds,
        }),
        listDirectoryResources({
          workspaceId,
          rootDir: input.qaArtifactsDir ? join(input.qaArtifactsDir, workspaceId) : undefined,
          type: 'qa_artifact',
          activeIds,
        }),
        listDirectoryResources({
          workspaceId,
          rootDir: input.transcriptDir ? join(input.transcriptDir, workspaceId) : undefined,
          type: 'runtime_transcript',
          activeIds,
        }),
      ])
      return [...backups, ...qaArtifacts, ...transcripts]
    },
    async deleteResource(resource: RetentionResource) {
      if (!resource.path) throw new Error(`Retention resource ${resource.id} has no path`)
      await rm(resource.path, { recursive: true, force: true })
    },
  }
}

export function createOperationalDataRetentionAdapter(): RetentionAdapter {
  return {
    async listResources(workspaceId: string) {
      const [activitiesResult, notificationsResult] = await Promise.all([
        pool.query(
          `
          SELECT id, workspace_id, type, created_at
          FROM activities
          WHERE workspace_id = $1
        `,
          [workspaceId],
        ),
        pool.query(
          `
          SELECT n.id, t.workspace_id, n.status, n.created_at
          FROM notifications n
          INNER JOIN tasks t ON t.id = n.task_id
          WHERE t.workspace_id = $1
        `,
          [workspaceId],
        ),
      ])

      const activities: RetentionResource[] = activitiesResult.rows.map((row) => ({
        id: row.id,
        workspace_id: row.workspace_id,
        type: row.type === 'alert' ? 'shadow_alert' : 'activity_feed',
        updated_at: new Date(row.created_at).toISOString(),
        metadata: { source_table: 'activities', activity_type: row.type },
      }))

      const notifications: RetentionResource[] = notificationsResult.rows.map((row) => ({
        id: row.id,
        workspace_id: row.workspace_id,
        type: 'notification',
        updated_at: new Date(row.created_at).toISOString(),
        active: row.status === 'pending',
        metadata: { source_table: 'notifications', status: row.status },
      }))

      return [...activities, ...notifications]
    },
    async deleteResource(resource: RetentionResource) {
      if (resource.workspace_id === undefined) {
        throw new Error(`Retention resource ${resource.id} has no workspace_id`)
      }
      if (resource.type === 'notification') {
        const result = await pool.query(
          `
          DELETE FROM notifications n
          USING tasks t
          WHERE n.id = $1
            AND n.task_id = t.id
            AND t.workspace_id = $2
            AND n.status <> 'pending'
        `,
          [resource.id, resource.workspace_id],
        )
        if ((result.rowCount ?? 0) === 0) {
          throw new Error(
            `Notification ${resource.id} was not deleted for workspace ${resource.workspace_id}`,
          )
        }
        return
      }

      const activityType = resource.type === 'shadow_alert' ? 'alert' : undefined
      const result = await pool.query(
        `
        DELETE FROM activities
        WHERE id = $1
          AND workspace_id = $2
          AND ($3::text IS NULL OR type = $3)
      `,
        [resource.id, resource.workspace_id, activityType],
      )
      if ((result.rowCount ?? 0) === 0) {
        throw new Error(
          `Activity ${resource.id} was not deleted for workspace ${resource.workspace_id}`,
        )
      }
    },
  }
}

export async function cleanupOperationalDataRetention(input: {
  policy: RetentionPolicy
  dry_run?: boolean
  created_by?: string
  skip_activity_log?: boolean
}): Promise<RetentionCleanupResult> {
  return cleanupExpiredRetentionResources({
    policy: input.policy,
    adapter: createOperationalDataRetentionAdapter(),
    dry_run: input.dry_run,
    created_by: input.created_by,
    skip_activity_log: input.skip_activity_log,
  })
}
