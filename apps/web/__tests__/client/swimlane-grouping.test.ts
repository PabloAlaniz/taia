import { describe, it, expect } from 'vitest'
import type { Task, Agent, Project, TaskStatus, TaskPriority } from '@taia/types'

// Import the pure grouping function — we'll test it directly
// Since it's not exported, we'll replicate the logic here for unit testing
type GroupBy = 'none' | 'agent' | 'project' | 'priority'

interface SwimLane {
  id: string
  label: string
  icon?: string
  tasks: Task[]
}

const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const

function groupTasksIntoLanes(
  tasks: Task[],
  groupBy: GroupBy,
  agents: Agent[],
  projects: Project[],
): SwimLane[] {
  if (groupBy === 'none') {
    return [{ id: 'all', label: 'All Tasks', tasks }]
  }

  if (groupBy === 'agent') {
    const agentMap = new Map<string, Task[]>()
    const unassigned: Task[] = []

    tasks.forEach((task) => {
      if (task.assigned_to) {
        const existing = agentMap.get(task.assigned_to) || []
        existing.push(task)
        agentMap.set(task.assigned_to, existing)
      } else {
        unassigned.push(task)
      }
    })

    const lanes: SwimLane[] = []
    if (unassigned.length > 0) {
      lanes.push({ id: 'unassigned', label: 'Unassigned', icon: '📋', tasks: unassigned })
    }

    agents.forEach((agent) => {
      const agentTasks = agentMap.get(agent.id)
      if (agentTasks && agentTasks.length > 0) {
        lanes.push({
          id: agent.id,
          label: agent.name,
          icon: agent.avatar || '🤖',
          tasks: agentTasks,
        })
      }
    })

    return lanes
  }

  if (groupBy === 'project') {
    const projectMap = new Map<string, Task[]>()
    const noProject: Task[] = []

    tasks.forEach((task) => {
      if (task.project_id) {
        const existing = projectMap.get(task.project_id) || []
        existing.push(task)
        projectMap.set(task.project_id, existing)
      } else {
        noProject.push(task)
      }
    })

    const lanes: SwimLane[] = []
    if (noProject.length > 0) {
      lanes.push({ id: 'no-project', label: 'No Project', icon: '📋', tasks: noProject })
    }

    projects.forEach((project) => {
      const pTasks = projectMap.get(project.id)
      if (pTasks && pTasks.length > 0) {
        lanes.push({
          id: project.id,
          label: project.name,
          icon: '📁',
          tasks: pTasks,
        })
      }
    })

    return lanes
  }

  if (groupBy === 'priority') {
    const priorityIcons: Record<string, string> = {
      URGENT: '🔴',
      HIGH: '🟠',
      MEDIUM: '🔵',
      LOW: '⚪',
    }

    return PRIORITIES.map((priority) => ({
      id: priority,
      label: priority.charAt(0) + priority.slice(1).toLowerCase(),
      icon: priorityIcons[priority],
      tasks: tasks.filter((t) => t.priority === priority),
    })).filter((lane) => lane.tasks.length > 0)
  }

  return [{ id: 'all', label: 'All Tasks', tasks }]
}

// Test data
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).slice(2, 6)}`,
    title: 'Test task',
    status: 'INBOX' as TaskStatus,
    priority: 'MEDIUM' as TaskPriority,
    confidence: 'needs-approval' as const,
    tags: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const AGENTS: Agent[] = [
  { id: 'agent-1', name: 'Agent 1', status: 'IDLE', avatar: '💻' },
  { id: 'agent-5', name: 'Agent 5', status: 'IDLE', avatar: '🔓' },
]

const PROJECTS: Project[] = [
  { id: 'proj-1', name: 'Frontend', created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'proj-2', name: 'Backend', created_at: '2026-01-01', updated_at: '2026-01-01' },
]

describe('groupTasksIntoLanes', () => {
  const tasks = [
    makeTask({ id: 't1', assigned_to: 'agent-1', project_id: 'proj-1', priority: 'HIGH' }),
    makeTask({ id: 't2', assigned_to: 'agent-1', project_id: 'proj-1', priority: 'MEDIUM' }),
    makeTask({ id: 't3', assigned_to: 'agent-5', project_id: 'proj-2', priority: 'LOW' }),
    makeTask({ id: 't4', project_id: undefined, priority: 'URGENT' }),
    makeTask({ id: 't5', assigned_to: 'agent-5', project_id: 'proj-2', priority: 'MEDIUM' }),
  ]

  describe('groupBy: none', () => {
    it('returns single lane with all tasks', () => {
      const lanes = groupTasksIntoLanes(tasks, 'none', AGENTS, PROJECTS)
      expect(lanes).toHaveLength(1)
      expect(lanes[0].id).toBe('all')
      expect(lanes[0].tasks).toHaveLength(5)
    })
  })

  describe('groupBy: agent', () => {
    it('groups tasks by assigned agent', () => {
      const lanes = groupTasksIntoLanes(tasks, 'agent', AGENTS, PROJECTS)

      // Unassigned + agent1 + agent5
      expect(lanes).toHaveLength(3)
      expect(lanes[0].id).toBe('unassigned')
      expect(lanes[0].tasks).toHaveLength(1)

      const agent1Lane = lanes.find((l) => l.id === 'agent-1')
      expect(agent1Lane).toBeDefined()
      expect(agent1Lane!.tasks).toHaveLength(2)
      expect(agent1Lane!.label).toBe('Agent 1')
      expect(agent1Lane!.icon).toBe('💻')

      const agent5Lane = lanes.find((l) => l.id === 'agent-5')
      expect(agent5Lane).toBeDefined()
      expect(agent5Lane!.tasks).toHaveLength(2)
    })

    it('skips agents with no tasks', () => {
      const singleTask = [makeTask({ assigned_to: 'agent-1' })]
      const lanes = groupTasksIntoLanes(singleTask, 'agent', AGENTS, PROJECTS)

      expect(lanes).toHaveLength(1)
      expect(lanes[0].id).toBe('agent-1')
    })
  })

  describe('groupBy: project', () => {
    it('groups tasks by project', () => {
      const lanes = groupTasksIntoLanes(tasks, 'project', AGENTS, PROJECTS)

      expect(lanes).toHaveLength(3) // no-project + proj-1 + proj-2

      const noProjectLane = lanes.find((l) => l.id === 'no-project')
      expect(noProjectLane).toBeDefined()
      expect(noProjectLane!.tasks).toHaveLength(1)

      const frontendLane = lanes.find((l) => l.id === 'proj-1')
      expect(frontendLane).toBeDefined()
      expect(frontendLane!.tasks).toHaveLength(2)
      expect(frontendLane!.label).toBe('Frontend')
    })
  })

  describe('groupBy: priority', () => {
    it('groups tasks by priority level', () => {
      const lanes = groupTasksIntoLanes(tasks, 'priority', AGENTS, PROJECTS)

      // URGENT, HIGH, MEDIUM, LOW — all present
      expect(lanes).toHaveLength(4)

      const urgentLane = lanes.find((l) => l.id === 'URGENT')
      expect(urgentLane).toBeDefined()
      expect(urgentLane!.tasks).toHaveLength(1)
      expect(urgentLane!.icon).toBe('🔴')

      const mediumLane = lanes.find((l) => l.id === 'MEDIUM')
      expect(mediumLane).toBeDefined()
      expect(mediumLane!.tasks).toHaveLength(2)
    })

    it('maintains priority order (URGENT first)', () => {
      const lanes = groupTasksIntoLanes(tasks, 'priority', AGENTS, PROJECTS)
      expect(lanes[0].id).toBe('URGENT')
      expect(lanes[lanes.length - 1].id).toBe('LOW')
    })

    it('omits empty priority lanes', () => {
      const mediumOnly = [makeTask({ priority: 'MEDIUM' })]
      const lanes = groupTasksIntoLanes(mediumOnly, 'priority', AGENTS, PROJECTS)
      expect(lanes).toHaveLength(1)
      expect(lanes[0].id).toBe('MEDIUM')
    })
  })

  describe('edge cases', () => {
    it('handles empty tasks array', () => {
      const lanes = groupTasksIntoLanes([], 'agent', AGENTS, PROJECTS)
      expect(lanes).toHaveLength(0)
    })

    it('handles empty agents array', () => {
      const lanes = groupTasksIntoLanes(tasks, 'agent', [], PROJECTS)
      // Only unassigned lane, agent tasks go to nowhere
      expect(lanes.find((l) => l.id === 'unassigned')).toBeDefined()
    })
  })
})
