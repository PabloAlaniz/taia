import { z } from 'zod'
import type { ToolDefinition } from '../tool-registry'
import {
  listTasks,
  getTask,
  createTaskWithBroadcast,
  updateTaskWithBroadcast,
  moveTaskWithBroadcast,
  assignTaskWithBroadcast,
  deleteTaskWithBroadcast,
} from '@taia/core/services/task.service'
import { getAgentById } from '@taia/core/db'

export const listTasksTool: ToolDefinition = {
  name: 'taia_list_tasks',
  description: 'List tasks from TAIA board with optional filters',
  params: {
    status: z
      .string()
      .optional()
      .describe(
        'Filter by board column slug (dynamic per workspace, e.g. INBOX, IN_PROGRESS, DONE)',
      ),
    project: z.string().optional().describe('Filter by project name'),
    assigned_to: z.string().optional().describe('Filter by agent ID'),
    priority: z.string().optional().describe('Filter by priority: LOW, MEDIUM, HIGH, URGENT'),
    q: z.string().optional().describe('Search query (matches title and description)'),
    workspace_id: z.string().optional().describe('Workspace ID (defaults to ws-default)'),
  },
  handler: async ({ status, project, assigned_to, priority, q, workspace_id }) => {
    const { tasks, total } = await listTasks({
      status,
      project,
      assigned_to,
      priority,
      q,
      workspace_id,
    })
    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assigned_to: t.assigned_to,
        project: t.project,
        tags: t.tags,
      })),
      total,
    }
  },
}

export const getTaskTool: ToolDefinition = {
  name: 'taia_get_task',
  description: 'Get full details of a specific task by ID',
  params: {
    taskId: z.string().describe('The task ID'),
  },
  handler: async ({ taskId }) => {
    const task = await getTask(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)
    return task
  },
}

export const createTaskTool: ToolDefinition = {
  name: 'taia_create_task',
  description: 'Create a new task on the TAIA board',
  params: {
    title: z.string().describe('Task title'),
    description: z.string().optional().describe('Task description'),
    status: z
      .string()
      .optional()
      .describe('Initial board column slug (default: workspace initial column)'),
    workspace_id: z.string().optional().describe('Workspace ID (defaults to ws-default)'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().describe('Priority level'),
    assigned_to: z.string().optional().describe('Agent ID to assign to'),
    project: z.string().optional().describe('Project name'),
    tags: z.array(z.string()).optional().describe('Tags to add'),
  },
  handler: async ({
    title,
    description,
    status,
    workspace_id,
    priority,
    assigned_to,
    project,
    tags,
  }) => {
    const task = await createTaskWithBroadcast({
      title,
      description,
      status: status as never,
      priority: priority as never,
      assigned_to,
      project,
      tags,
      workspace_id,
      created_by: 'mcp',
    })
    return { created: true, task }
  },
}

export const updateTaskTool: ToolDefinition = {
  name: 'taia_update_task',
  description: 'Update an existing task (title, description, priority, tags, etc.)',
  params: {
    taskId: z.string().describe('The task ID to update'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().describe('New priority'),
    tags: z.array(z.string()).optional().describe('Replace tags'),
    due_date: z.string().optional().describe('Due date (ISO format)'),
  },
  handler: async ({ taskId, ...updates }) => {
    const task = await updateTaskWithBroadcast(taskId, updates, 'mcp')
    if (!task) throw new Error(`Task ${taskId} not found`)
    return { updated: true, task }
  },
}

export const moveTaskTool: ToolDefinition = {
  name: 'taia_move_task',
  description: 'Move a task to a different status column on the board',
  params: {
    taskId: z.string().describe('The task ID to move'),
    status: z.string().describe('Target board column slug (e.g. INBOX, IN_PROGRESS, DONE)'),
  },
  handler: async ({ taskId, status }) => {
    const task = await moveTaskWithBroadcast(taskId, status as never, 'mcp')
    if (!task) throw new Error(`Task ${taskId} not found`)
    return { moved: true, task: { id: task.id, title: task.title, status: task.status } }
  },
}

export const assignTaskTool: ToolDefinition = {
  name: 'taia_assign_task',
  description: 'Assign a task to an agent',
  params: {
    taskId: z.string().describe('The task ID to assign'),
    agentId: z.string().describe('The agent ID to assign to'),
  },
  handler: async ({ taskId, agentId }) => {
    const agent = await getAgentById(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)
    const task = await assignTaskWithBroadcast(taskId, agentId, 'mcp')
    if (!task) throw new Error(`Task ${taskId} not found`)
    return {
      assigned: true,
      task: { id: task.id, title: task.title, assigned_to: task.assigned_to, status: task.status },
    }
  },
}

export const searchTasksTool: ToolDefinition = {
  name: 'taia_search_tasks',
  description: 'Search tasks by text query across titles and descriptions',
  params: {
    query: z.string().describe('Search text'),
    status: z.string().optional().describe('Optional status filter'),
  },
  handler: async ({ query, status }) => {
    const { tasks, total } = await listTasks({ q: query, status })
    return {
      results: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assigned_to: t.assigned_to,
        description: t.description?.slice(0, 200),
      })),
      total,
    }
  },
}

export const deleteTaskTool: ToolDefinition = {
  name: 'taia_delete_task',
  description: 'Delete a task by ID (permanent; removes subtasks, messages and tags)',
  params: {
    taskId: z.string().describe('The task ID to delete'),
  },
  handler: async ({ taskId }) => {
    const task = await getTask(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)
    await deleteTaskWithBroadcast(taskId, 'mcp')
    return { deleted: true, taskId }
  },
}

export const taskTools: ToolDefinition[] = [
  listTasksTool,
  getTaskTool,
  createTaskTool,
  updateTaskTool,
  moveTaskTool,
  assignTaskTool,
  searchTasksTool,
  deleteTaskTool,
]
