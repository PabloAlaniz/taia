import { describe, it, expect } from 'vitest'

describe('MCP tool imports resolve correctly', () => {
  it('all tool modules load without error', async () => {
    const { taskTools } = await import('../../src/tools/task-tools')
    const { agentTools } = await import('../../src/tools/agent-tools')
    const { worktreeTools } = await import('../../src/tools/worktree-tools')
    const { dependencyTools } = await import('../../src/tools/dependency-tools')
    const { workspaceTools } = await import('../../src/tools/workspace-tools')
    const { projectTools } = await import('../../src/tools/project-tools')
    const { sessionTools } = await import('../../src/tools/session-tools')
    const { planningTools } = await import('../../src/tools/planning-tools')
    const { subtaskTools } = await import('../../src/tools/subtask-tools')
    const { messageTools } = await import('../../src/tools/message-tools')

    const all = [
      ...taskTools,
      ...agentTools,
      ...worktreeTools,
      ...dependencyTools,
      ...workspaceTools,
      ...projectTools,
      ...sessionTools,
      ...planningTools,
      ...subtaskTools,
      ...messageTools,
    ]

    expect(all.length).toBe(35)

    for (const tool of all) {
      expect(tool.name).toBeTruthy()
      expect(tool.description).toBeTruthy()
      expect(typeof tool.handler).toBe('function')
    }
  })
})
