import { describe, it, expect } from 'vitest'
import {
  CreateWorkspaceSchema,
  UpdateWorkspaceSchema,
  CreateBoardColumnSchema,
  UpdateBoardColumnSchema,
  ReorderColumnsSchema,
  WorkspaceAgentsSchema,
} from '@taia/core/validation/schemas'

describe('CreateWorkspaceSchema', () => {
  it('accepts valid workspace with name only', () => {
    const result = CreateWorkspaceSchema.safeParse({ name: 'My Workspace' })
    expect(result.success).toBe(true)
  })

  it('accepts workspace with all optional fields', () => {
    const result = CreateWorkspaceSchema.safeParse({
      name: 'Full Workspace',
      description: 'A detailed description',
      icon: '🏢',
      color: 'blue',
      preset_id: 'preset-dev',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing name', () => {
    const result = CreateWorkspaceSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects empty name', () => {
    const result = CreateWorkspaceSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects name over 200 chars', () => {
    const result = CreateWorkspaceSchema.safeParse({ name: 'a'.repeat(201) })
    expect(result.success).toBe(false)
  })
})

describe('UpdateWorkspaceSchema', () => {
  it('accepts partial update (name only)', () => {
    const result = UpdateWorkspaceSchema.safeParse({ name: 'Updated Name' })
    expect(result.success).toBe(true)
  })

  it('accepts empty update (all optional)', () => {
    const result = UpdateWorkspaceSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('transforms null description to undefined', () => {
    const result = UpdateWorkspaceSchema.safeParse({ description: null })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBeUndefined()
    }
  })
})

describe('CreateBoardColumnSchema', () => {
  it('accepts valid column', () => {
    const result = CreateBoardColumnSchema.safeParse({
      slug: 'IN_PROGRESS',
      label: 'In Progress',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing slug', () => {
    const result = CreateBoardColumnSchema.safeParse({
      label: 'In Progress',
    })
    expect(result.success).toBe(false)
  })

  it('accepts lowercase slug', () => {
    const result = CreateBoardColumnSchema.safeParse({
      slug: 'in_progress',
      label: 'In Progress',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing label', () => {
    const result = CreateBoardColumnSchema.safeParse({
      slug: 'TODO',
    })
    expect(result.success).toBe(false)
  })

  it('accepts column with all optional fields', () => {
    const result = CreateBoardColumnSchema.safeParse({
      slug: 'DONE',
      label: 'Done',
      icon: '✅',
      is_done_state: true,
      is_initial_state: false,
      color: 'green',
    })
    expect(result.success).toBe(true)
  })
})

describe('UpdateBoardColumnSchema', () => {
  it('accepts partial update', () => {
    const result = UpdateBoardColumnSchema.safeParse({
      label: 'Updated Label',
      is_done_state: true,
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty update', () => {
    const result = UpdateBoardColumnSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

describe('ReorderColumnsSchema', () => {
  it('accepts valid order array', () => {
    const result = ReorderColumnsSchema.safeParse({
      column_ids: ['col-1', 'col-2', 'col-3'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty order array', () => {
    const result = ReorderColumnsSchema.safeParse({
      column_ids: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects order with empty strings', () => {
    const result = ReorderColumnsSchema.safeParse({
      column_ids: ['col-1', ''],
    })
    expect(result.success).toBe(false)
  })
})

describe('WorkspaceAgentsSchema', () => {
  it('accepts valid agent_ids array', () => {
    const result = WorkspaceAgentsSchema.safeParse({
      agent_ids: ['agent-1', 'agent-2'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty agent_ids array (allows clearing all agents)', () => {
    const result = WorkspaceAgentsSchema.safeParse({
      agent_ids: [],
    })
    expect(result.success).toBe(true)
  })
})
