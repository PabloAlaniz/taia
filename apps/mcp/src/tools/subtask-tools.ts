import { z } from 'zod'
import type { ToolDefinition } from '../tool-registry'
import { getSubtasksForTask, createSubtask, updateSubtask } from '@taia/core/db'

export const listSubtasksTool: ToolDefinition = {
  name: 'taia_list_subtasks',
  description: 'List subtasks for a given task',
  params: {
    taskId: z.string().describe('The parent task ID'),
  },
  handler: async ({ taskId }) => {
    const subtasks = await getSubtasksForTask(taskId)
    return {
      subtasks: subtasks.map((s) => ({
        id: s.id,
        title: s.title,
        completed: s.completed,
        position: s.position,
      })),
    }
  },
}

export const createSubtaskTool: ToolDefinition = {
  name: 'taia_create_subtask',
  description: 'Create a new subtask on a task',
  params: {
    task_id: z.string().describe('The parent task ID'),
    title: z.string().describe('Subtask title'),
  },
  handler: async ({ task_id, title }) => {
    const subtask = await createSubtask({ task_id, title })
    return { created: true, subtask }
  },
}

export const updateSubtaskTool: ToolDefinition = {
  name: 'taia_update_subtask',
  description: 'Update a subtask (title, completed, position)',
  params: {
    subtaskId: z.string().describe('The subtask ID to update'),
    title: z.string().optional().describe('New title'),
    completed: z.boolean().optional().describe('Mark as completed or not'),
    position: z.number().optional().describe('New position order'),
  },
  handler: async ({ subtaskId, ...updates }) => {
    const subtask = await updateSubtask(subtaskId, updates)
    if (!subtask) throw new Error(`Subtask ${subtaskId} not found`)
    return { updated: true, subtask }
  },
}

export const subtaskTools: ToolDefinition[] = [
  listSubtasksTool,
  createSubtaskTool,
  updateSubtaskTool,
]
