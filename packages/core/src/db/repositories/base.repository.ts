// Base repository — Template Method pattern for CRUD operations
// Subclasses declare table, updatable fields, and normalization hooks.
// The base handles: getById, update (dynamic SET builder), delete, withTransaction.

import type { PoolClient } from 'pg'
import { pool } from '../pool'

export interface RepositoryConfig<T> {
  /** PostgreSQL table name */
  readonly tableName: string
  /** Fields permitted in UPDATE SET clause (allowlist) */
  readonly updatableFields: readonly string[]
  /** Transform a raw DB row into the domain type. Identity by default. */
  normalize?(row: Record<string, unknown>): T
  /** Custom value serialization per field (e.g., config → JSON.stringify) */
  serializeField?(key: string, value: unknown): unknown
}

export class CrudRepository<T extends { id: string }> {
  constructor(protected readonly config: RepositoryConfig<T>) {}

  protected normalize(row: Record<string, unknown>): T {
    return this.config.normalize ? this.config.normalize(row) : (row as T)
  }

  /**
   * Find a single entity by ID.
   * Override in subclasses that need JOINs or computed columns (e.g., task with tags).
   */
  async getById(id: string): Promise<T | undefined> {
    const res = await pool.query(`SELECT * FROM ${this.config.tableName} WHERE id = $1`, [id])
    return res.rows[0] ? this.normalize(res.rows[0]) : undefined
  }

  /**
   * Dynamic UPDATE using the allowedFields whitelist.
   * Returns null if entity doesn't exist.
   * Override for entities with special update logic (e.g., task auto-status).
   */
  async update(id: string, updates: Partial<T>): Promise<T | null> {
    const existing = await this.getById(id)
    if (!existing) return null

    const sets: string[] = []
    const values: unknown[] = []
    let idx = 1

    for (const [key, value] of Object.entries(updates)) {
      if (this.config.updatableFields.includes(key)) {
        sets.push(`${key} = $${idx++}`)
        values.push(this.config.serializeField ? this.config.serializeField(key, value) : value)
      }
    }

    if (sets.length > 0) {
      values.push(id)
      await pool.query(
        `UPDATE ${this.config.tableName} SET ${sets.join(', ')} WHERE id = $${idx}`,
        values,
      )
    }

    return (await this.getById(id)) ?? null
  }

  /**
   * Delete by ID. Returns true if a row was deleted.
   * Override for entities with custom delete logic (e.g., predefined filter check).
   */
  async delete(id: string): Promise<boolean> {
    const res = await pool.query(`DELETE FROM ${this.config.tableName} WHERE id = $1`, [id])
    return (res.rowCount ?? 0) > 0
  }

  /**
   * Execute a callback within a transaction.
   * Handles BEGIN, COMMIT, ROLLBACK, and client release.
   */
  protected async withTransaction<R>(fn: (client: PoolClient) => Promise<R>): Promise<R> {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }
}
