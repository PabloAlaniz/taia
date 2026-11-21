// Runtime instances — the named runtimes agents run on.
// `config` holds the provider's non-secret fields; secrets live in settings
// under `runtime.instances.<id>.*`.

import { pool } from '../pool'

export interface RuntimeInstanceRow {
  id: string
  provider: string
  label: string
  config: Record<string, string>
  created_at: string
  updated_at: string
}

export async function listRuntimeInstances(): Promise<RuntimeInstanceRow[]> {
  const res = await pool.query<RuntimeInstanceRow>('SELECT * FROM runtime_instances ORDER BY id')
  return res.rows
}

export async function getRuntimeInstance(id: string): Promise<RuntimeInstanceRow | null> {
  const res = await pool.query<RuntimeInstanceRow>(
    'SELECT * FROM runtime_instances WHERE id = $1',
    [id],
  )
  return res.rows[0] ?? null
}

/**
 * Create the instance, or merge `config` into an existing one. A field set
 * to `null` is removed from the config.
 */
export async function upsertRuntimeInstance(input: {
  id: string
  provider: string
  label: string
  config: Record<string, string | null>
}): Promise<RuntimeInstanceRow> {
  const set = Object.fromEntries(Object.entries(input.config).filter(([, v]) => v !== null))
  const unset = Object.entries(input.config)
    .filter(([, v]) => v === null)
    .map(([k]) => k)
  const res = await pool.query<RuntimeInstanceRow>(
    `INSERT INTO runtime_instances (id, provider, label, config)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE
       SET config = (runtime_instances.config || EXCLUDED.config) - $5::text[],
           updated_at = NOW()
     RETURNING *`,
    [input.id, input.provider, input.label, JSON.stringify(set), unset],
  )
  return res.rows[0]
}
