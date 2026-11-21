import { describe, it, expect } from 'vitest'
import {
  CreateTaskSchema,
  CreateAgentSchema,
  CreateMessageSchema,
  AssignTaskSchema,
  TaskActionSchema,
  CreateSubtaskSchema,
  SetWipLimitSchema,
  NotificationActionSchema,
} from '@taia/core/validation/schemas'

describe('CreateTaskSchema', () => {
  it('accepts valid task', () => {
    const result = CreateTaskSchema.safeParse({ title: 'My Task', created_by: 'web-ui' })
    expect(result.success).toBe(true)
  })

  it('accepts task with all optional fields', () => {
    const result = CreateTaskSchema.safeParse({
      title: 'Full Task',
      description: 'Description here',
      status: 'INBOX',
      priority: 'HIGH',
      confidence: 'auto-merge',
      project: 'taia',
      tags: ['urgent', 'frontend'],
      assigned_to: 'agent-1',
      created_by: 'mcp',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing created_by', () => {
    const result = CreateTaskSchema.safeParse({ title: 'Test' })
    expect(result.success).toBe(false)
  })

  it('rejects empty created_by', () => {
    const result = CreateTaskSchema.safeParse({ title: 'Test', created_by: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing title', () => {
    const result = CreateTaskSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects empty title', () => {
    const result = CreateTaskSchema.safeParse({ title: '' })
    expect(result.success).toBe(false)
  })

  it('accepts any column slug as status (checked against the workspace later)', () => {
    expect(
      CreateTaskSchema.safeParse({ title: 'Test', status: 'LEAD', created_by: 'x' }).success,
    ).toBe(true)
  })

  it('rejects an empty status', () => {
    const result = CreateTaskSchema.safeParse({ title: 'Test', status: '  ' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid priority', () => {
    const result = CreateTaskSchema.safeParse({ title: 'Test', priority: 'SUPER' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid confidence', () => {
    const result = CreateTaskSchema.safeParse({ title: 'Test', confidence: 'HIGH' })
    expect(result.success).toBe(false)
  })

  it('accepts valid confidence values', () => {
    for (const c of ['auto-merge', 'notify-only', 'needs-approval']) {
      const result = CreateTaskSchema.safeParse({
        title: 'Test',
        confidence: c,
        created_by: 'web-ui',
      })
      expect(result.success).toBe(true)
    }
  })
})

describe('CreateAgentSchema', () => {
  it('accepts valid agent', () => {
    const result = CreateAgentSchema.safeParse({ id: 'new-agent', name: 'New Agent' })
    expect(result.success).toBe(true)
  })

  it('rejects uppercase id', () => {
    const result = CreateAgentSchema.safeParse({ id: 'BadId', name: 'Test' })
    expect(result.success).toBe(false)
  })

  it('rejects id with spaces', () => {
    const result = CreateAgentSchema.safeParse({ id: 'bad id', name: 'Test' })
    expect(result.success).toBe(false)
  })

  it('rejects id with special characters', () => {
    const result = CreateAgentSchema.safeParse({ id: 'bad!id', name: 'Test' })
    expect(result.success).toBe(false)
  })

  it('accepts id with hyphens and underscores', () => {
    const result = CreateAgentSchema.safeParse({ id: 'my-agent_01', name: 'Agent' })
    expect(result.success).toBe(true)
  })

  it('rejects missing id', () => {
    const result = CreateAgentSchema.safeParse({ name: 'Agent' })
    expect(result.success).toBe(false)
  })

  it('rejects missing name', () => {
    const result = CreateAgentSchema.safeParse({ id: 'agent' })
    expect(result.success).toBe(false)
  })
})

describe('CreateMessageSchema', () => {
  it('accepts snake_case fields', () => {
    const result = CreateMessageSchema.safeParse({
      task_id: 'task-1',
      from_agent_id: 'agent-1',
      content: 'Hello',
    })
    expect(result.success).toBe(true)
  })

  it('accepts camelCase fields', () => {
    const result = CreateMessageSchema.safeParse({
      taskId: 'task-1',
      fromAgentId: 'agent-1',
      content: 'Hello',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing content', () => {
    const result = CreateMessageSchema.safeParse({
      task_id: 'task-1',
      from_agent_id: 'agent-1',
    })
    expect(result.success).toBe(false)
  })

  it('accepts message without task_id (task_id removed from schema)', () => {
    const result = CreateMessageSchema.safeParse({
      from_agent_id: 'agent-1',
      content: 'Hello',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing from_agent_id and fromAgentId', () => {
    const result = CreateMessageSchema.safeParse({
      task_id: 'task-1',
      content: 'Hello',
    })
    expect(result.success).toBe(false)
  })
})

describe('AssignTaskSchema', () => {
  it('accepts valid assignment', () => {
    const result = AssignTaskSchema.safeParse({ taskId: 'task-1', agentId: 'agent-1' })
    expect(result.success).toBe(true)
  })

  it('rejects missing taskId', () => {
    const result = AssignTaskSchema.safeParse({ agentId: 'agent-1' })
    expect(result.success).toBe(false)
  })

  it('rejects missing agentId', () => {
    const result = AssignTaskSchema.safeParse({ taskId: 'task-1' })
    expect(result.success).toBe(false)
  })
})

describe('TaskActionSchema (discriminated union)', () => {
  it('accepts create action', () => {
    const result = TaskActionSchema.safeParse({
      action: 'create',
      task: { title: 'New Task', created_by: 'web-ui' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts move action', () => {
    const result = TaskActionSchema.safeParse({
      action: 'move',
      taskId: 'task-1',
      status: 'DONE',
    })
    expect(result.success).toBe(true)
  })

  it('accepts update action', () => {
    const result = TaskActionSchema.safeParse({
      action: 'update',
      taskId: 'task-1',
      updates: { title: 'Updated' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown action', () => {
    const result = TaskActionSchema.safeParse({ action: 'delete' })
    expect(result.success).toBe(false)
  })

  it('rejects move with an empty status', () => {
    const result = TaskActionSchema.safeParse({
      action: 'move',
      taskId: 'task-1',
      status: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('CreateSubtaskSchema', () => {
  it('accepts valid subtask', () => {
    const result = CreateSubtaskSchema.safeParse({ title: 'Subtask' })
    expect(result.success).toBe(true)
  })

  it('rejects empty title', () => {
    const result = CreateSubtaskSchema.safeParse({ title: '' })
    expect(result.success).toBe(false)
  })
})

describe('SetWipLimitSchema', () => {
  it('accepts positive integer', () => {
    const result = SetWipLimitSchema.safeParse({ wip_limit: 5 })
    expect(result.success).toBe(true)
  })

  it('accepts null (no limit)', () => {
    const result = SetWipLimitSchema.safeParse({ wip_limit: null })
    expect(result.success).toBe(true)
  })

  it('rejects zero', () => {
    const result = SetWipLimitSchema.safeParse({ wip_limit: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects negative number', () => {
    const result = SetWipLimitSchema.safeParse({ wip_limit: -1 })
    expect(result.success).toBe(false)
  })
})

describe('NotificationActionSchema', () => {
  it('accepts deliver action', () => {
    const result = NotificationActionSchema.safeParse({
      action: 'deliver',
      notificationId: 'n-1',
    })
    expect(result.success).toBe(true)
  })

  it('accepts fail action', () => {
    const result = NotificationActionSchema.safeParse({
      action: 'fail',
      notificationId: 'n-1',
      attempts: 3,
    })
    expect(result.success).toBe(true)
  })

  it('accepts create action', () => {
    const result = NotificationActionSchema.safeParse({
      action: 'create',
      mentioned_agent_id: 'agent-1',
      content: 'Hey @agent-1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects create without mentioned_agent_id', () => {
    const result = NotificationActionSchema.safeParse({
      action: 'create',
      content: 'Hey',
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown action', () => {
    const result = NotificationActionSchema.safeParse({
      action: 'unknown',
    })
    expect(result.success).toBe(false)
  })
})
