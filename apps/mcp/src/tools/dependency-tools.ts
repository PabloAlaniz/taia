import { z } from 'zod'
import type { ToolDefinition } from '../tool-registry'

export const addDependencyTool: ToolDefinition = {
  name: 'taia_add_dependency',
  description: 'Add a dependency between tasks (taskId is blocked by dependsOnTaskId)',
  params: {
    taskId: z.string().describe('The task ID that will be blocked'),
    dependsOnTaskId: z.string().describe('The task ID that blocks the first task'),
  },
  handler: async ({ taskId, dependsOnTaskId }) => {
    const { addTaskDependency } = await import('@taia/core/services/dependency.service')
    const dependency = await addTaskDependency(taskId, dependsOnTaskId, 'mcp')
    return {
      added: true,
      dependency: {
        id: dependency.id,
        task_id: dependency.task_id,
        depends_on_task_id: dependency.depends_on_task_id,
      },
    }
  },
}

export const removeDependencyTool: ToolDefinition = {
  name: 'taia_remove_dependency',
  description: 'Remove a dependency between tasks',
  params: {
    taskId: z.string().describe('The task ID that was blocked'),
    dependsOnTaskId: z.string().describe('The task ID that was blocking'),
  },
  handler: async ({ taskId, dependsOnTaskId }) => {
    const { removeTaskDependency } = await import('@taia/core/services/dependency.service')
    await removeTaskDependency(taskId, dependsOnTaskId, 'mcp')
    return { removed: true }
  },
}

export const getDependenciesTool: ToolDefinition = {
  name: 'taia_get_dependencies',
  description: 'Get all dependencies (blockers and dependents) for a task',
  params: {
    taskId: z.string().describe('The task ID to check'),
  },
  handler: async ({ taskId }) => {
    const { getDependencies } = await import('@taia/core/services/dependency.service')
    const { blockers, dependents } = await getDependencies(taskId)
    return {
      task_id: taskId,
      blockers: blockers.map((b) => ({
        id: b.depends_on_task_id,
        title: b.depends_on_title,
        status: b.depends_on_status,
      })),
      dependents: dependents.map((d) => ({
        id: d.task_id,
        title: d.task_title,
        status: d.task_status,
      })),
    }
  },
}

export const dependencyTools: ToolDefinition[] = [
  addDependencyTool,
  removeDependencyTool,
  getDependenciesTool,
]
