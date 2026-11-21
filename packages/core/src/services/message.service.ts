// Message service — message creation with mentions and notifications

import { getMessagesForTask, createMessage } from '../db/index'
import type { Message } from '@taia/types'

export async function listMessagesForTask(taskId: string): Promise<Message[]> {
  return getMessagesForTask(taskId)
}

export async function createMessageForTask(data: {
  task_id: string
  from_agent_id: string
  content: string
}): Promise<Message> {
  // createMessage in the repository already handles mention extraction
  // and notification creation within the same function
  return createMessage(data)
}
