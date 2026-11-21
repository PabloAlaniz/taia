/**
 * Integration test: Migration runner
 * Verifies all migrations can run in order against a fresh database.
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
} from '../db/test-db-helper'

const available = testDBAvailable

beforeAll(async () => {
  if (!available) return
  await dropAllTables()
})

afterAll(async () => {
  if (available) {
    await dropAllTables()
  }
  await cleanupTestPool()
})

describe.skipIf(!available)('Migration Runner (integration)', () => {
  const pool = getTestPool()

  it('runs all migrations without error on a fresh database', async () => {
    await expect(runAllMigrations()).resolves.not.toThrow()
  })

  it('creates the expected tables', async () => {
    const res = await pool.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `)
    const tables = res.rows.map((r) => r.tablename)

    // Core tables
    expect(tables).toContain('agents')
    expect(tables).toContain('tasks')
    expect(tables).toContain('activities')
    expect(tables).toContain('projects')
    expect(tables).toContain('subtasks')
    expect(tables).toContain('messages')

    // Feature tables
    expect(tables).toContain('board_columns')
    expect(tables).toContain('saved_filters')
    expect(tables).toContain('task_dependencies')
    expect(tables).toContain('worktrees')
    expect(tables).toContain('session_costs')

    // Workspace tables
    expect(tables).toContain('workspaces')
    expect(tables).toContain('workspace_agents')
    expect(tables).toContain('workspace_presets')
  })

  it('tasks table has workspace_id column', async () => {
    const res = await pool.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name = 'workspace_id'
    `)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].is_nullable).toBe('NO')
  })

  it('tasks table has NO status CHECK constraint', async () => {
    const res = await pool.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'tasks'::regclass AND conname = 'tasks_status_check'
    `)
    expect(res.rows).toHaveLength(0)
  })

  it('board_columns has unique constraint on (workspace_id, slug)', async () => {
    const res = await pool.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'board_columns'::regclass
        AND conname = 'board_columns_workspace_id_slug_key'
    `)
    expect(res.rows).toHaveLength(1)
  })

  it('default workspace is created with is_default=true', async () => {
    const res = await pool.query('SELECT * FROM workspaces WHERE is_default = TRUE')
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].id).toBe('ws-default')
  })

  it('workspace_presets are seeded', async () => {
    const res = await pool.query('SELECT COUNT(*) AS count FROM workspace_presets')
    expect(Number(res.rows[0].count)).toBeGreaterThanOrEqual(5)
  })

  it('update_updated_at trigger function exists', async () => {
    const res = await pool.query(`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_name = 'update_updated_at'
    `)
    expect(res.rows).toHaveLength(1)
  })
})
