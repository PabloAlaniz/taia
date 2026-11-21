import { z } from 'zod'
import type { ToolDefinition } from '../tool-registry'
import { generatePlan } from '@taia/core/services/planning.service'

export const generatePlanTool: ToolDefinition = {
  name: 'taia_generate_plan',
  description: 'Generate a task plan from a goal description',
  params: {
    goal: z.string().describe('The goal to plan for'),
    context: z.string().optional().describe('Additional context for planning'),
  },
  handler: async ({ goal, context }) => {
    const result = await generatePlan({ goal, context })
    return { tasks: result.tasks }
  },
}

export const planningTools: ToolDefinition[] = [generatePlanTool]
