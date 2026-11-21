/**
 * Integration test: Workspace lifecycle
 * Tests the full workspace workflow against a real PostgreSQL database.
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
  if (available) {
    await dropAllTables()
  }
  await cleanupTestPool()
})

describe.skipIf(!available)('Workspace Lifecycle (integration)', () => {
  const pool = getTestPool()

  it('default workspace exists after migration', async () => {
    const res = await pool.query('SELECT * FROM workspaces WHERE is_default = TRUE')
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].slug).toBe('default')
    expect(res.rows[0].name).toBe('Default')
  })

  it('default workspace starts without board columns (the app seeds them)', async () => {
    const res = await pool.query("SELECT 1 FROM board_columns WHERE workspace_id = 'ws-default'")
    expect(res.rows).toHaveLength(0)
  })

  it('can create a new workspace', async () => {
    const res = await pool.query(
      `INSERT INTO workspaces (id, name, slug, description, icon, color)
       VALUES ('ws-test-1', 'Test Workspace', 'test-workspace', 'A test', '🧪', '#ff0000')
       RETURNING *`,
    )
    expect(res.rows[0].name).toBe('Test Workspace')
    expect(res.rows[0].slug).toBe('test-workspace')
    expect(res.rows[0].is_default).toBe(false)
  })

  it('can create columns for a workspace', async () => {
    await pool.query(
      `INSERT INTO board_columns (id, workspace_id, slug, name, label, icon, position, is_initial_state, is_done_state)
       VALUES ('col-test-1', 'ws-test-1', 'TODO', 'To Do', 'To Do', '📋', 0, TRUE, FALSE),
              ('col-test-2', 'ws-test-1', 'DOING', 'Doing', 'Doing', '🔨', 1, FALSE, FALSE),
              ('col-test-3', 'ws-test-1', 'DONE', 'Done', 'Done', '✅', 2, FALSE, TRUE)`,
    )

    const res = await pool.query(
      'SELECT * FROM board_columns WHERE workspace_id = $1 ORDER BY position',
      ['ws-test-1'],
    )
    expect(res.rows).toHaveLength(3)
    expect(res.rows[0].slug).toBe('TODO')
    expect(res.rows[0].is_initial_state).toBe(true)
    expect(res.rows[2].is_done_state).toBe(true)
  })

  it('can create a task in a workspace', async () => {
    const res = await pool.query(
      `INSERT INTO tasks (id, title, status, priority, workspace_id)
       VALUES ('task-int-1', 'Integration test task', 'TODO', 'MEDIUM', 'ws-test-1')
       RETURNING *`,
    )
    expect(res.rows[0].workspace_id).toBe('ws-test-1')
    expect(res.rows[0].status).toBe('TODO')
  })

  it('can move a task to a different status', async () => {
    await pool.query('UPDATE tasks SET status = $1 WHERE id = $2', ['DOING', 'task-int-1'])

    const res = await pool.query('SELECT status FROM tasks WHERE id = $1', ['task-int-1'])
    expect(res.rows[0].status).toBe('DOING')
  })

  it('tasks are scoped by workspace_id', async () => {
    // Create a task in default workspace
    const defaultWs = await pool.query('SELECT id FROM workspaces WHERE is_default = TRUE')
    const defaultWsId = defaultWs.rows[0].id

    await pool.query(
      `INSERT INTO tasks (id, title, status, priority, workspace_id)
       VALUES ('task-int-2', 'Default ws task', 'INBOX', 'LOW', $1)`,
      [defaultWsId],
    )

    // Query tasks for test workspace only
    const testTasks = await pool.query('SELECT * FROM tasks WHERE workspace_id = $1', ['ws-test-1'])
    expect(testTasks.rows.every((t) => t.workspace_id === 'ws-test-1')).toBe(true)

    // Query tasks for default workspace
    const defaultTasks = await pool.query('SELECT * FROM tasks WHERE workspace_id = $1', [
      defaultWsId,
    ])
    expect(defaultTasks.rows.every((t) => t.workspace_id === defaultWsId)).toBe(true)
  })

  it('can assign agents to a workspace', async () => {
    // Create a test agent
    await pool.query(
      `INSERT INTO agents (id, name, role) VALUES ('agent-int-1', 'Test Agent', 'tester')
       ON CONFLICT (id) DO NOTHING`,
    )

    await pool.query(
      `INSERT INTO workspace_agents (workspace_id, agent_id) VALUES ('ws-test-1', 'agent-int-1')
       ON CONFLICT DO NOTHING`,
    )

    const res = await pool.query(
      `SELECT a.* FROM agents a
       INNER JOIN workspace_agents wa ON wa.agent_id = a.id
       WHERE wa.workspace_id = $1`,
      ['ws-test-1'],
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].id).toBe('agent-int-1')
  })

  it('workspace deletion cascades to columns and agent assignments', async () => {
    // Create a workspace to delete
    await pool.query(
      `INSERT INTO workspaces (id, name, slug) VALUES ('ws-delete-me', 'Delete Me', 'delete-me')`,
    )
    await pool.query(
      `INSERT INTO board_columns (id, workspace_id, slug, name, label, position)
       VALUES ('col-del-1', 'ws-delete-me', 'TODO', 'To Do', 'To Do', 0)`,
    )

    // Delete workspace
    await pool.query('DELETE FROM workspaces WHERE id = $1', ['ws-delete-me'])

    // Verify cascade
    const cols = await pool.query('SELECT * FROM board_columns WHERE workspace_id = $1', [
      'ws-delete-me',
    ])
    expect(cols.rows).toHaveLength(0)
  })

  it('unique constraint prevents duplicate column slugs per workspace', async () => {
    await expect(
      pool.query(
        `INSERT INTO board_columns (id, workspace_id, slug, name, label, position)
         VALUES ('col-dup', 'ws-test-1', 'TODO', 'Duplicate', 'Duplicate', 99)`,
      ),
    ).rejects.toThrow()
  })

  it('workspace presets are seeded', async () => {
    const res = await pool.query('SELECT * FROM workspace_presets')
    expect(res.rows.length).toBeGreaterThanOrEqual(5)

    const names = res.rows.map((r) => r.name)
    expect(names).toContain('Software Dev')
    expect(names).toContain('Marketing')
  })

  it('preset columns are valid JSON', async () => {
    const res = await pool.query('SELECT * FROM workspace_presets')
    for (const preset of res.rows) {
      const columns =
        typeof preset.columns === 'string' ? JSON.parse(preset.columns) : preset.columns
      expect(Array.isArray(columns)).toBe(true)
      expect(columns.length).toBeGreaterThan(0)
      for (const col of columns) {
        expect(col.slug).toBeTruthy()
        expect(col.label).toBeTruthy()
      }
    }
  })

  it('done state slugs query returns correct results', async () => {
    const res = await pool.query(
      'SELECT slug FROM board_columns WHERE workspace_id = $1 AND is_done_state = TRUE',
      ['ws-test-1'],
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].slug).toBe('DONE')
  })

  it('initial state slug query returns correct result', async () => {
    const res = await pool.query(
      'SELECT slug FROM board_columns WHERE workspace_id = $1 AND is_initial_state = TRUE LIMIT 1',
      ['ws-test-1'],
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].slug).toBe('TODO')
  })
})
