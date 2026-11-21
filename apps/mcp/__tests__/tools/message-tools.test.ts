import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListMessagesForTask = vi.fn()
const mockCreateMessageForTask = vi.fn()

vi.mock('@taia/core/services/message.service', () => ({
  listMessagesForTask: (...args: any[]) => mockListMessagesForTask(...args),
  createMessageForTask: (...args: any[]) => mockCreateMessageForTask(...args),
}))

import { listMessagesTool, sendMessageTool, messageTools } from '../../src/tools/message-tools'

const SAMPLE_MESSAGES = [
  {
    id: 'msg-1',
    from_agent_id: 'agent-1',
    content: 'Started working on auth',
    created_at: '2026-03-05T10:00:00Z',
  },
  {
    id: 'msg-2',
    from_agent_id: 'agent-2',
    content: 'Looks good, please add tests',
    created_at: '2026-03-05T10:15:00Z',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listMessagesTool', () => {
  it('has correct name and description', () => {
    expect(listMessagesTool.name).toBe('taia_list_messages')
    expect(listMessagesTool.description).toBeTruthy()
  })

  it('returns messages', async () => {
    mockListMessagesForTask.mockResolvedValue(SAMPLE_MESSAGES)

    const result = await listMessagesTool.handler({ taskId: 'task-1' })

    expect(result).toEqual({
      messages: [
        {
          id: 'msg-1',
          from_agent_id: 'agent-1',
          content: 'Started working on auth',
          created_at: '2026-03-05T10:00:00Z',
        },
        {
          id: 'msg-2',
          from_agent_id: 'agent-2',
          content: 'Looks good, please add tests',
          created_at: '2026-03-05T10:15:00Z',
        },
      ],
    })
    expect(mockListMessagesForTask).toHaveBeenCalledWith('task-1')
  })
})

describe('sendMessageTool', () => {
  it('has correct name and description', () => {
    expect(sendMessageTool.name).toBe('taia_send_message')
    expect(sendMessageTool.description).toBeTruthy()
  })

  it('sends and returns message', async () => {
    const created = {
      id: 'msg-3',
      task_id: 'task-1',
      from_agent_id: 'agent-1',
      content: 'Auth implementation complete',
      created_at: '2026-03-05T11:00:00Z',
    }
    mockCreateMessageForTask.mockResolvedValue(created)

    const result = await sendMessageTool.handler({
      task_id: 'task-1',
      from_agent_id: 'agent-1',
      content: 'Auth implementation complete',
    })

    expect(result).toEqual({ sent: true, message: created })
    expect(mockCreateMessageForTask).toHaveBeenCalledWith({
      task_id: 'task-1',
      from_agent_id: 'agent-1',
      content: 'Auth implementation complete',
    })
  })
})

describe('messageTools array', () => {
  it('has 2 items', () => {
    expect(messageTools).toHaveLength(2)
  })
})
