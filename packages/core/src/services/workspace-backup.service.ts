import { createHash } from 'node:crypto'
import * as JSZip from 'jszip'

const JSZipClass = ((JSZip as unknown as { default?: typeof JSZip }).default ??
  JSZip) as unknown as {
  new (): JSZip
  loadAsync(data: Buffer | Uint8Array): Promise<JSZip>
}

export const WORKSPACE_BACKUP_SCHEMA_VERSION = 1

export type WorkspaceBackupEntityName =
  | 'workspace'
  | 'tasks'
  | 'messages'
  | 'subtasks'
  | 'columns'
  | 'agents'
  | 'projects'
  | 'repositories'
  | 'settings'
  | 'tagColors'
  | 'templates'
  | 'dependencies'

export interface WorkspaceBackupEntity {
  name: WorkspaceBackupEntityName | string
  data: unknown
}

export interface WorkspaceBackupManifestEntry {
  path: string
  entity: string
  sha256: string
  bytes: number
}

export interface WorkspaceBackupManifest {
  schema_version: typeof WORKSPACE_BACKUP_SCHEMA_VERSION
  workspace_id: string
  created_at: string
  entities: WorkspaceBackupManifestEntry[]
}

export interface WorkspaceBackupPreflightOk {
  ok: true
  manifest: WorkspaceBackupManifest
  diagnostics: string[]
}

export interface WorkspaceBackupPreflightFailed {
  ok: false
  diagnostics: string[]
}

export type WorkspaceBackupPreflightResult =
  | WorkspaceBackupPreflightOk
  | WorkspaceBackupPreflightFailed

export interface WorkspaceBackupRestoreAdapter {
  restoreWorkspaceBackup(input: {
    workspaceId: string
    manifest: WorkspaceBackupManifest
    entities: WorkspaceBackupEntity[]
  }): Promise<void>
}

export interface WorkspaceBackupSnapshotSchedule {
  workspaceId: string
  enabled: boolean
  intervalMinutes: number
  retentionCount: number
  lastSnapshotAt?: string | null
  nextSnapshotAt?: string | null
}

export interface WorkspaceBackupSnapshotInventoryItem {
  id: string
  workspace_id: string
  created_at: string
  manifest: WorkspaceBackupManifest
  backup_sha256: string
  backup_bytes: number
  integrity: WorkspaceBackupPreflightResult
  file_name: string
}

export interface WorkspaceBackupSnapshotResult {
  snapshot: WorkspaceBackupSnapshotInventoryItem
  backup: Buffer
}

export interface WorkspaceBackupRetentionPlan {
  kept: WorkspaceBackupSnapshotInventoryItem[]
  delete: WorkspaceBackupSnapshotInventoryItem[]
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortForStableJson(value), null, 2)}\n`
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForStableJson)
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortForStableJson((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }

  return value
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function sha256Buffer(content: Buffer | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function sanitizeSnapshotPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '-')
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

function entityPath(entityName: string): string {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(entityName)) {
    throw new Error(`Invalid backup entity name: ${entityName}`)
  }
  return `entities/${entityName}.json`
}

function parseJsonWithDiagnostic(
  raw: string,
  label: string,
  diagnostics: string[],
): unknown | undefined {
  try {
    return JSON.parse(raw)
  } catch (error) {
    diagnostics.push(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
    return undefined
  }
}

function validateManifest(
  value: unknown,
  diagnostics: string[],
): WorkspaceBackupManifest | undefined {
  if (!value || typeof value !== 'object') {
    diagnostics.push('manifest.json must contain an object')
    return undefined
  }

  const manifest = value as Partial<WorkspaceBackupManifest>
  if (manifest.schema_version !== WORKSPACE_BACKUP_SCHEMA_VERSION) {
    diagnostics.push(
      `Unsupported backup schema_version ${String(manifest.schema_version)}; expected ${WORKSPACE_BACKUP_SCHEMA_VERSION}`,
    )
  }
  if (!manifest.workspace_id || typeof manifest.workspace_id !== 'string') {
    diagnostics.push('manifest.workspace_id is required')
  }
  if (!manifest.created_at || Number.isNaN(Date.parse(manifest.created_at))) {
    diagnostics.push('manifest.created_at must be an ISO timestamp')
  }
  if (!Array.isArray(manifest.entities)) {
    diagnostics.push('manifest.entities must be an array')
  } else {
    for (let index = 0; index < manifest.entities.length; index += 1) {
      const entry = manifest.entities[index]
      if (!entry || typeof entry !== 'object') {
        diagnostics.push(`manifest.entities[${index}] must be an object`)
        continue
      }
      if (!entry.path || typeof entry.path !== 'string' || !entry.path.startsWith('entities/')) {
        diagnostics.push(`manifest.entities[${index}].path must point under entities/`)
      }
      if (!entry.entity || typeof entry.entity !== 'string') {
        diagnostics.push(`manifest.entities[${index}].entity is required`)
      }
      if (
        !entry.sha256 ||
        typeof entry.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(entry.sha256)
      ) {
        diagnostics.push(`manifest.entities[${index}].sha256 must be a hex SHA-256 digest`)
      }
      if (!Number.isInteger(entry.bytes) || entry.bytes < 0) {
        diagnostics.push(`manifest.entities[${index}].bytes must be a non-negative integer`)
      }
    }
  }

  return diagnostics.length === 0 ? (manifest as WorkspaceBackupManifest) : undefined
}

async function readBackup(buffer: Buffer | Uint8Array): Promise<{
  manifest?: WorkspaceBackupManifest
  entities: WorkspaceBackupEntity[]
  diagnostics: string[]
}> {
  const diagnostics: string[] = []
  let zip: JSZip
  try {
    zip = await JSZipClass.loadAsync(buffer)
  } catch (error) {
    return {
      entities: [],
      diagnostics: [
        `Backup ZIP could not be opened: ${error instanceof Error ? error.message : String(error)}`,
      ],
    }
  }

  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) {
    return { entities: [], diagnostics: ['Backup ZIP is missing manifest.json'] }
  }

  const manifestRaw = await manifestFile.async('string')
  const manifestJson = parseJsonWithDiagnostic(manifestRaw, 'manifest.json', diagnostics)
  const manifest = validateManifest(manifestJson, diagnostics)
  if (!manifest) {
    return { entities: [], diagnostics }
  }

  const entities: WorkspaceBackupEntity[] = []
  for (const entry of manifest.entities) {
    const file = zip.file(entry.path)
    if (!file) {
      diagnostics.push(`Missing entity file: ${entry.path}`)
      continue
    }

    const raw = await file.async('string')
    const actualHash = sha256(raw)
    if (actualHash !== entry.sha256) {
      diagnostics.push(
        `Hash mismatch for ${entry.path}: expected ${entry.sha256}, got ${actualHash}`,
      )
    }
    if (Buffer.byteLength(raw, 'utf8') !== entry.bytes) {
      diagnostics.push(
        `Byte length mismatch for ${entry.path}: expected ${entry.bytes}, got ${Buffer.byteLength(raw, 'utf8')}`,
      )
    }

    const data = parseJsonWithDiagnostic(raw, entry.path, diagnostics)
    entities.push({ name: entry.entity, data })
  }

  return { manifest, entities, diagnostics }
}

export async function createWorkspaceBackupZip(input: {
  workspaceId: string
  entities: WorkspaceBackupEntity[]
  createdAt?: Date
}): Promise<Buffer> {
  if (!input.workspaceId) {
    throw new Error('workspaceId is required')
  }

  const zip = new JSZipClass()
  const entries: WorkspaceBackupManifestEntry[] = []

  for (const entity of input.entities) {
    const path = entityPath(entity.name)
    const payload = stableJson(entity.data)
    zip.file(path, payload)
    entries.push({
      path,
      entity: entity.name,
      sha256: sha256(payload),
      bytes: Buffer.byteLength(payload, 'utf8'),
    })
  }

  const manifest: WorkspaceBackupManifest = {
    schema_version: WORKSPACE_BACKUP_SCHEMA_VERSION,
    workspace_id: input.workspaceId,
    created_at: (input.createdAt ?? new Date()).toISOString(),
    entities: entries.sort((a, b) => a.path.localeCompare(b.path)),
  }
  zip.file('manifest.json', stableJson(manifest))

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

export function nextWorkspaceBackupSnapshotAt(input: {
  intervalMinutes: number
  lastSnapshotAt?: string | null
  now?: Date
}): string {
  if (!Number.isFinite(input.intervalMinutes) || input.intervalMinutes <= 0) {
    throw new Error('intervalMinutes must be a positive number')
  }

  const base = input.lastSnapshotAt ? new Date(input.lastSnapshotAt) : (input.now ?? new Date())
  if (Number.isNaN(base.getTime())) {
    throw new Error('lastSnapshotAt must be an ISO timestamp when provided')
  }

  return addMinutes(base, input.intervalMinutes).toISOString()
}

export function listDueWorkspaceBackupSnapshotSchedules(
  schedules: WorkspaceBackupSnapshotSchedule[],
  now = new Date(),
): WorkspaceBackupSnapshotSchedule[] {
  return schedules.filter((schedule) => {
    if (!schedule.enabled) return false
    if (!schedule.workspaceId) return false
    if (!Number.isFinite(schedule.intervalMinutes) || schedule.intervalMinutes <= 0) return false

    const dueAt = schedule.nextSnapshotAt
      ? new Date(schedule.nextSnapshotAt)
      : new Date(
          nextWorkspaceBackupSnapshotAt({
            intervalMinutes: schedule.intervalMinutes,
            lastSnapshotAt: schedule.lastSnapshotAt,
            now,
          }),
        )

    return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() <= now.getTime()
  })
}

export async function createWorkspaceBackupSnapshot(input: {
  workspaceId: string
  entities: WorkspaceBackupEntity[]
  createdAt?: Date
  snapshotId?: string
}): Promise<WorkspaceBackupSnapshotResult> {
  const createdAt = input.createdAt ?? new Date()
  const backup = await createWorkspaceBackupZip({
    workspaceId: input.workspaceId,
    entities: input.entities,
    createdAt,
  })
  const integrity = await preflightRestoreWorkspaceBackupZip({
    backup,
    targetWorkspaceId: input.workspaceId,
  })
  if (!integrity.ok) {
    throw new Error(`Snapshot integrity preflight failed: ${integrity.diagnostics.join('; ')}`)
  }

  const snapshotId = input.snapshotId ?? `${input.workspaceId}-${createdAt.toISOString()}`
  const snapshot: WorkspaceBackupSnapshotInventoryItem = {
    id: snapshotId,
    workspace_id: input.workspaceId,
    created_at: createdAt.toISOString(),
    manifest: integrity.manifest,
    backup_sha256: sha256Buffer(backup),
    backup_bytes: backup.byteLength,
    integrity,
    file_name: `${sanitizeSnapshotPart(input.workspaceId)}-${sanitizeSnapshotPart(createdAt.toISOString())}.zip`,
  }

  return { snapshot, backup }
}

export async function verifyWorkspaceBackupSnapshot(input: {
  snapshot: WorkspaceBackupSnapshotInventoryItem
  backup: Buffer | Uint8Array
}): Promise<WorkspaceBackupPreflightResult> {
  const diagnostics: string[] = []
  const actualHash = sha256Buffer(input.backup)
  if (actualHash !== input.snapshot.backup_sha256) {
    diagnostics.push(
      `Snapshot archive hash mismatch: expected ${input.snapshot.backup_sha256}, got ${actualHash}`,
    )
  }
  if (input.backup.byteLength !== input.snapshot.backup_bytes) {
    diagnostics.push(
      `Snapshot archive byte length mismatch: expected ${input.snapshot.backup_bytes}, got ${input.backup.byteLength}`,
    )
  }

  const preflight = await preflightRestoreWorkspaceBackupZip({
    backup: input.backup,
    targetWorkspaceId: input.snapshot.workspace_id,
  })
  if (!preflight.ok) {
    return { ok: false, diagnostics: [...diagnostics, ...preflight.diagnostics] }
  }
  if (preflight.manifest.created_at !== input.snapshot.manifest.created_at) {
    diagnostics.push(
      `Snapshot manifest created_at mismatch: inventory ${input.snapshot.manifest.created_at}, archive ${preflight.manifest.created_at}`,
    )
  }
  if (preflight.manifest.workspace_id !== input.snapshot.manifest.workspace_id) {
    diagnostics.push(
      `Snapshot manifest workspace mismatch: inventory ${input.snapshot.manifest.workspace_id}, archive ${preflight.manifest.workspace_id}`,
    )
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics }
  return {
    ok: true,
    manifest: preflight.manifest,
    diagnostics: [
      `Snapshot verified for workspace ${input.snapshot.workspace_id}: ${preflight.manifest.entities.length} entity file(s), ${input.snapshot.backup_bytes} byte(s)`,
    ],
  }
}

export function planWorkspaceBackupSnapshotRetention(input: {
  workspaceId: string
  snapshots: WorkspaceBackupSnapshotInventoryItem[]
  retentionCount: number
}): WorkspaceBackupRetentionPlan {
  if (!input.workspaceId) throw new Error('workspaceId is required')
  if (!Number.isInteger(input.retentionCount) || input.retentionCount < 1) {
    throw new Error('retentionCount must be a positive integer')
  }

  const scoped = input.snapshots
    .filter((snapshot) => snapshot.workspace_id === input.workspaceId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  return {
    kept: scoped.slice(0, input.retentionCount),
    delete: scoped.slice(input.retentionCount),
  }
}

export async function preflightRestoreWorkspaceBackupZip(input: {
  backup: Buffer | Uint8Array
  targetWorkspaceId: string
}): Promise<WorkspaceBackupPreflightResult> {
  const { manifest, diagnostics } = await readBackup(input.backup)
  if (!manifest) {
    return { ok: false, diagnostics }
  }

  if (manifest.workspace_id !== input.targetWorkspaceId) {
    diagnostics.push(
      `Workspace mismatch: backup is for ${manifest.workspace_id}, target is ${input.targetWorkspaceId}`,
    )
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics }
  }

  return {
    ok: true,
    manifest,
    diagnostics: [
      `Backup preflight ok for workspace ${input.targetWorkspaceId}: ${manifest.entities.length} entity file(s) verified`,
    ],
  }
}

export async function restoreWorkspaceBackupZip(input: {
  backup: Buffer | Uint8Array
  targetWorkspaceId: string
  adapter: WorkspaceBackupRestoreAdapter
}): Promise<WorkspaceBackupPreflightResult> {
  const read = await readBackup(input.backup)
  if (!read.manifest) {
    return { ok: false, diagnostics: read.diagnostics }
  }

  const preflight = await preflightRestoreWorkspaceBackupZip({
    backup: input.backup,
    targetWorkspaceId: input.targetWorkspaceId,
  })
  if (!preflight.ok) {
    return preflight
  }

  await input.adapter.restoreWorkspaceBackup({
    workspaceId: input.targetWorkspaceId,
    manifest: read.manifest,
    entities: read.entities,
  })

  return preflight
}
