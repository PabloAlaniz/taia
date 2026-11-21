import type { AgentContextBundle } from '@taia/types'

/** A complete bundle for renderer tests; override layers as needed. */
export function sampleBundle(overrides: Partial<AgentContextBundle> = {}): AgentContextBundle {
  return {
    agent: {
      id: 'alex',
      name: 'Alex',
      role: 'Reviewer',
      persona: 'You review pull requests carefully.',
      instructions: 'Always read the test plan before approving.',
      constraints: ['Never merge your own PR.'],
      capabilities: ['read_tasks', 'comment_tasks'],
    },
    project: { name: 'TAIA', description: 'Kanban for AI agents.' },
    user: { id: 'user-1', displayName: 'Sam', facts: ['Writes in Spanish.'] },
    task: {
      taskId: 'task-7',
      title: 'Review PR #42',
      description: 'Sign off on the runtime refactor.',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      workspace: { path: '/w/task-7', branch: 'task-7', baseBranch: 'main' },
    },
    memory: { recall: [], archival: [], working: {} },
    ...overrides,
  }
}
