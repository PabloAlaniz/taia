/**
 * Integration test: Filter flow (e2e)
 * Tests: create task → verify filters match → delete task
 *
 * Requires: pnpm db:test:up (Postgres de test en localhost:5433)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  getTestPool,
  testDBAvailable,
  runAllMigrations,
  dropAllTables,
  cleanupTestPool,
} from './test-db-helper'
import type { Pool } from 'pg'

const available = testDBAvailable
let pool: Pool

beforeAll(async () => {
  pool = getTestPool()
  if (!available) return

  await dropAllTables()
  await runAllMigrations()
})

afterAll(async () => {
  if (available) {
    await dropAllTables()
  }
  await cleanupTestPool()
})

describe.skipIf(!available)('Filter Flow E2E (integration)', () => {
  let workspaceId: string

  it('connects to test database', async () => {
    const res = await pool.query('SELECT 1 as ok')
    expect(res.rows[0].ok).toBe(1)
  })

  // --- Predefined filters ---

  it('has no predefined filters (the toolbar dropdowns replace them)', async () => {
    const res = await pool.query('SELECT 1 FROM saved_filters WHERE is_predefined = TRUE')
    expect(res.rows).toHaveLength(0)
  })

  // --- Create test data ---

  it('creates tasks for filter testing', async () => {
    const ws = await pool.query('SELECT id FROM workspaces WHERE is_default = TRUE')
    workspaceId = ws.rows[0].id

    // Task 1: assigned, HIGH priority
    await pool.query(
      `INSERT INTO tasks (id, title, status, priority, confidence, assigned_to, created_by, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'e2e-task-1',
        'Assigned High Task',
        'INBOX',
        'HIGH',
        'notify-only',
        'agent-test',
        'system',
        workspaceId,
      ],
    )
    // Add tags via task_tags table
    await pool.query(
      `INSERT INTO task_tags (task_id, tag) VALUES ('e2e-task-1', 'blocked'), ('e2e-task-1', 'urgent')`,
    )

    // Task 2: unassigned, LOW priority
    await pool.query(
      `INSERT INTO tasks (id, title, status, priority, confidence, created_by, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['e2e-task-2', 'Unassigned Low Task', 'INBOX', 'LOW', 'notify-only', 'system', workspaceId],
    )

    // Task 3: assigned, DONE
    await pool.query(
      `INSERT INTO tasks (id, title, status, priority, confidence, assigned_to, created_by, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'e2e-task-3',
        'Done Task',
        'DONE',
        'MEDIUM',
        'notify-only',
        'agent-test',
        'system',
        workspaceId,
      ],
    )

    const count = await pool.query("SELECT count(*) FROM tasks WHERE id LIKE 'e2e-task-%'")
    expect(parseInt(count.rows[0].count)).toBe(3)
  })

  // --- Verify filter conditions match real DB queries ---

  it('"My Tasks" (assigned: true) → returns only assigned tasks', async () => {
    const res = await pool.query(
      `SELECT id FROM tasks WHERE workspace_id = $1 AND assigned_to IS NOT NULL`,
      [workspaceId],
    )
    const ids = res.rows.map((r: any) => r.id)
    expect(ids).toContain('e2e-task-1')
    expect(ids).toContain('e2e-task-3')
    expect(ids).not.toContain('e2e-task-2')
  })

  it('"Unassigned" (unassigned: true) → returns only unassigned tasks', async () => {
    const res = await pool.query(
      `SELECT id FROM tasks WHERE workspace_id = $1 AND assigned_to IS NULL`,
      [workspaceId],
    )
    const ids = res.rows.map((r: any) => r.id)
    expect(ids).toContain('e2e-task-2')
    expect(ids).not.toContain('e2e-task-1')
  })

  it('"Blocked" (has_blockers: true) → returns tasks with blocked tag', async () => {
    const res = await pool.query(
      `SELECT DISTINCT t.id FROM tasks t
       JOIN task_tags tt ON t.id = tt.task_id
       WHERE t.workspace_id = $1 AND tt.tag = 'blocked'`,
      [workspaceId],
    )
    const ids = res.rows.map((r: any) => r.id)
    expect(ids).toContain('e2e-task-1')
    expect(ids).not.toContain('e2e-task-2')
    expect(ids).not.toContain('e2e-task-3')
  })

  it('priority filter → HIGH only', async () => {
    const res = await pool.query(
      `SELECT id FROM tasks WHERE workspace_id = $1 AND priority = 'HIGH'`,
      [workspaceId],
    )
    const ids = res.rows.map((r: any) => r.id)
    expect(ids).toContain('e2e-task-1')
    expect(ids).not.toContain('e2e-task-2')
    expect(ids).not.toContain('e2e-task-3')
  })

  it('combined: assigned + HIGH + not DONE → single match', async () => {
    const res = await pool.query(
      `SELECT id FROM tasks
       WHERE workspace_id = $1
         AND assigned_to IS NOT NULL
         AND priority = 'HIGH'
         AND status != 'DONE'`,
      [workspaceId],
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].id).toBe('e2e-task-1')
  })

  // --- Custom filter CRUD ---

  it('creates a custom saved filter', async () => {
    await pool.query(
      `INSERT INTO saved_filters (id, name, icon, filter_config, is_predefined, sort_order)
       VALUES ($1, $2, $3, $4, FALSE, 99)`,
      ['e2e-filter', 'E2E Test Filter', '🧪', JSON.stringify({ priority: 'HIGH', assigned: true })],
    )
    const res = await pool.query("SELECT * FROM saved_filters WHERE id = 'e2e-filter'")
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].is_predefined).toBe(false)
  })

  it('custom filter config is correct', async () => {
    const res = await pool.query("SELECT filter_config FROM saved_filters WHERE id = 'e2e-filter'")
    const config =
      typeof res.rows[0].filter_config === 'string'
        ? JSON.parse(res.rows[0].filter_config)
        : res.rows[0].filter_config
    expect(config.priority).toBe('HIGH')
    expect(config.assigned).toBe(true)
  })

  // --- Cleanup ---

  it('deletes test tasks and custom filter', async () => {
    await pool.query("DELETE FROM task_tags WHERE task_id LIKE 'e2e-task-%'")
    await pool.query("DELETE FROM tasks WHERE id LIKE 'e2e-task-%'")
    await pool.query("DELETE FROM saved_filters WHERE id = 'e2e-filter'")

    const tasks = await pool.query("SELECT id FROM tasks WHERE id LIKE 'e2e-task-%'")
    expect(tasks.rows).toHaveLength(0)

    const filters = await pool.query("SELECT id FROM saved_filters WHERE id = 'e2e-filter'")
    expect(filters.rows).toHaveLength(0)
  })
})
