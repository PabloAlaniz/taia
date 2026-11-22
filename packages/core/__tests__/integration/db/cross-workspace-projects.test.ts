/**
 * Integration test: projects cut across workspaces (migration 0004).
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

const available = testDBAvailable

beforeAll(async () => {
  if (!available) return
  await dropAllTables()
  await runAllMigrations()
})

afterAll(async () => {
  if (available) await dropAllTables()
  await cleanupTestPool()
})

describe.skipIf(!available)('Cross-workspace projects (integration)', () => {
  const pool = getTestPool()

  it('a project can exist without a workspace', async () => {
    await pool.query(`INSERT INTO projects (id, name) VALUES ('p-free', 'Free project')`)
    const res = await pool.query(`SELECT workspace_id FROM projects WHERE id = 'p-free'`)
    expect(res.rows[0].workspace_id).toBeNull()
  })

  it('tasks in different workspaces can share a project', async () => {
    await pool.query(
      `INSERT INTO workspaces (id, name, slug) VALUES ('ws-flow-a', 'Flow A', 'flow-a'), ('ws-flow-b', 'Flow B', 'flow-b')`,
    )
    await pool.query(
      `INSERT INTO tasks (id, title, workspace_id, project_id) VALUES
         ('t-a', 'In A', 'ws-flow-a', 'p-free'),
         ('t-b', 'In B', 'ws-flow-b', 'p-free')`,
    )
    const res = await pool.query(
      `SELECT DISTINCT workspace_id FROM tasks WHERE project_id = 'p-free' ORDER BY workspace_id`,
    )
    expect(res.rows.map((r) => r.workspace_id)).toEqual(['ws-flow-a', 'ws-flow-b'])
  })

  it('deleting the home workspace keeps the project', async () => {
    await pool.query(`INSERT INTO workspaces (id, name, slug) VALUES ('ws-home', 'Home', 'home')`)
    await pool.query(
      `INSERT INTO projects (id, name, workspace_id) VALUES ('p-homed', 'Homed', 'ws-home')`,
    )
    await pool.query(`DELETE FROM workspaces WHERE id = 'ws-home'`)
    const res = await pool.query(`SELECT workspace_id FROM projects WHERE id = 'p-homed'`)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].workspace_id).toBeNull()
  })
})
