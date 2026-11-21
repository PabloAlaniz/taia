import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGeneratePlan = vi.fn()

vi.mock('@taia/core/services/planning.service', () => ({
  generatePlan: (...args: any[]) => mockGeneratePlan(...args),
}))

import { generatePlanTool, planningTools } from '../../src/tools/planning-tools'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generatePlanTool', () => {
  it('has correct name and description', () => {
    expect(generatePlanTool.name).toBe('taia_generate_plan')
    expect(generatePlanTool.description).toBeTruthy()
  })

  it('generates plan and returns tasks', async () => {
    const planned = {
      tasks: [
        {
          title: 'Setup database schema',
          priority: 'HIGH',
          description: 'Create tables for users and auth',
        },
        {
          title: 'Implement JWT auth',
          priority: 'HIGH',
          description: 'Add login/register endpoints',
        },
        {
          title: 'Add unit tests',
          priority: 'MEDIUM',
          description: 'Cover auth service with tests',
        },
      ],
    }
    mockGeneratePlan.mockResolvedValue(planned)

    const result = await generatePlanTool.handler({ goal: 'Add authentication to the API' })

    expect(result).toEqual({ tasks: planned.tasks })
    expect(mockGeneratePlan).toHaveBeenCalledWith({
      goal: 'Add authentication to the API',
      context: undefined,
    })
  })

  it('passes context when provided', async () => {
    mockGeneratePlan.mockResolvedValue({ tasks: [{ title: 'Migrate data', priority: 'HIGH' }] })

    await generatePlanTool.handler({
      goal: 'Migrate to PostgreSQL',
      context: 'Currently using SQLite',
    })

    expect(mockGeneratePlan).toHaveBeenCalledWith({
      goal: 'Migrate to PostgreSQL',
      context: 'Currently using SQLite',
    })
  })
})

describe('planningTools array', () => {
  it('has 1 item', () => {
    expect(planningTools).toHaveLength(1)
  })
})
