import { z } from 'zod'
import type { ToolDefinition } from '../tool-registry'
import { listMessagesForTask, createMessageForTask } from '@taia/core/services/message.service'

export const listMessagesTool: ToolDefinition = {
  name: 'taia_list_messages',
  description: 'List messages for a task',
  params: {
    taskId: z.string().describe('The task ID'),
  },
  handler: async ({ taskId }) => {
    const msgs = await listMessagesForTask(taskId)
    return {
      messages: msgs.map((m) => ({
        id: m.id,
        from_agent_id: m.from_agent_id,
        content: m.content,
        created_at: m.created_at,
      })),
    }
  },
}

export const sendMessageTool: ToolDefinition = {
  name: 'taia_send_message',
  description: 'Send a message on a task thread',
  params: {
    task_id: z.string().describe('The task ID'),
    from_agent_id: z.string().describe('The agent ID sending the message'),
    content: z.string().describe('Message content'),
  },
  handler: async ({ task_id, from_agent_id, content }) => {
    const message = await createMessageForTask({ task_id, from_agent_id, content })
    return { sent: true, message }
  },
}

export const messageTools: ToolDefinition[] = [listMessagesTool, sendMessageTool]
