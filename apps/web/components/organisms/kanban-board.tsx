'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { DragDropContext, DropResult } from '@hello-pangea/dnd'
import { Column } from './column'
import { Task, TaskStatus, Agent, Project, BoardColumn } from '@taia/types'
import { cn } from '../../lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge, Button } from '../atoms'
import type { GroupBy } from '../../lib/store'
import type { WaitingReason } from '../../lib/use-board-signals'

const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const

interface SwimLane {
  id: string
  label: string
  /** Edge colour for lanes that are one participant. */
  kind?: 'agent' | 'person'
  tasks: Task[]
}

interface KanbanBoardProps {
  tasks: Task[]
  agents: Agent[]
  projects?: Project[]
  columns?: BoardColumn[]
  groupBy?: GroupBy
  selectedTaskId: string | null
  assigning: string | null
  columnSettings?: Record<string, number | null>
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void
  onSelectTask: (taskId: string | null) => void
  onAssign: (taskId: string, agentId: string) => void
  onEditWipLimit?: (status: string) => void
  costs?: Record<string, number>
  waiting?: Record<string, WaitingReason>
  running?: Set<string>
  onDecide?: (approvalId: string, decision: 'approved' | 'rejected') => Promise<string | null>
}

interface LaneLabels {
  allTasks: string
  unassigned: string
  noProject: string
}

function groupTasksIntoLanes(
  tasks: Task[],
  groupBy: GroupBy,
  agents: Agent[],
  projects: Project[],
  labels: LaneLabels,
): SwimLane[] {
  if (groupBy === 'none') {
    return [{ id: 'all', label: labels.allTasks, tasks }]
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
      lanes.push({ id: 'unassigned', label: labels.unassigned, tasks: unassigned })
    }

    agents.forEach((agent) => {
      const agentTasks = agentMap.get(agent.id)
      if (agentTasks && agentTasks.length > 0) {
        lanes.push({
          id: agent.id,
          label: agent.name,
          kind: agent.type === 'human' ? 'person' : 'agent',
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
      lanes.push({ id: 'no-project', label: labels.noProject, tasks: noProject })
    }

    projects.forEach((project) => {
      const pTasks = projectMap.get(project.id)
      if (pTasks && pTasks.length > 0) {
        lanes.push({
          id: project.id,
          label: project.name,
          tasks: pTasks,
        })
      }
    })

    return lanes
  }

  if (groupBy === 'priority') {
    return PRIORITIES.map((priority) => ({
      id: priority,
      label: priority.charAt(0) + priority.slice(1).toLowerCase(),
      tasks: tasks.filter((t) => t.priority === priority),
    })).filter((lane) => lane.tasks.length > 0)
  }

  return [{ id: 'all', label: labels.allTasks, tasks }]
}

export function KanbanBoard({
  tasks,
  agents,
  projects = [],
  columns: columnsProp,
  groupBy = 'none',
  selectedTaskId,
  assigning,
  columnSettings = {},
  onMoveTask,
  onSelectTask,
  onAssign,
  onEditWipLimit,
  costs,
  waiting,
  running,
  onDecide,
}: KanbanBoardProps) {
  const t = useTranslations('board')
  const columns = columnsProp || []
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set())

  if (columns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted text-sm">{t('noColumns')}</p>
      </div>
    )
  }

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    // droppableId format: "{slug}" for no-group, "{laneId}:{slug}" for swimlanes
    const destId = result.destination.droppableId
    const newStatus = destId.includes(':') ? destId.split(':')[1] : destId
    onMoveTask(result.draggableId, newStatus)
  }

  const laneLabels: LaneLabels = {
    allTasks: t('allTasks'),
    unassigned: t('unassigned'),
    noProject: t('noProject'),
  }
  const lanes = groupTasksIntoLanes(tasks, groupBy, agents, projects, laneLabels)
  const isSwimlane = groupBy !== 'none'

  const toggleLane = (laneId: string) => {
    setCollapsedLanes((prev) => {
      const next = new Set(prev)
      if (next.has(laneId)) {
        next.delete(laneId)
      } else {
        next.add(laneId)
      }
      return next
    })
  }

  const getTasksByStatus = (laneTasks: Task[], slug: string) =>
    laneTasks.filter((t) => t.status === slug)

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <main
        id="main-content"
        className={cn(
          'flex-1 px-4 md:px-6 pb-4 pt-1 min-h-0',
          !isSwimlane && 'flex gap-3 overflow-x-auto',
          isSwimlane && 'overflow-auto',
        )}
      >
        {lanes.map((lane) => {
          const isCollapsed = collapsedLanes.has(lane.id)

          if (!isSwimlane) {
            // No grouping — flat columns
            return columns.map((col) => (
              <Column
                key={col.slug}
                column={col}
                droppableId={col.slug}
                tasks={getTasksByStatus(lane.tasks, col.slug)}
                agents={agents}
                selectedTaskId={selectedTaskId}
                assigning={assigning}
                wipLimit={columnSettings[col.slug]}
                onSelectTask={onSelectTask}
                onAssign={onAssign}
                onEditWipLimit={onEditWipLimit}
                costs={costs}
                waiting={waiting}
                running={running}
                onDecide={onDecide}
              />
            ))
          }

          // Swimlane mode
          return (
            <div key={lane.id} className="mb-3">
              {/* Swimlane header */}
              <Button
                variant="ghost"
                size="md"
                onClick={() => toggleLane(lane.id)}
                aria-expanded={!isCollapsed}
                className="flex items-center gap-2 mb-2 w-full text-left"
              >
                {isCollapsed ? (
                  <ChevronRight size={14} className="text-muted" aria-hidden="true" />
                ) : (
                  <ChevronDown size={14} className="text-muted" aria-hidden="true" />
                )}
                {lane.kind && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'w-1 h-3.5 rounded-[1px]',
                      lane.kind === 'person' ? 'bg-person' : 'bg-agent',
                    )}
                  />
                )}
                <span className="font-semibold text-sm text-foreground">{lane.label}</span>
                <Badge variant="muted" size="xs">
                  {lane.tasks.length}
                </Badge>
              </Button>

              {/* Columns row */}
              {!isCollapsed && (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {columns.map((col) => (
                    <Column
                      key={`${lane.id}-${col.slug}`}
                      column={col}
                      droppableId={`${lane.id}:${col.slug}`}
                      tasks={getTasksByStatus(lane.tasks, col.slug)}
                      agents={agents}
                      selectedTaskId={selectedTaskId}
                      assigning={assigning}
                      wipLimit={columnSettings[col.slug]}
                      onSelectTask={onSelectTask}
                      onAssign={onAssign}
                      onEditWipLimit={onEditWipLimit}
                      costs={costs}
                      waiting={waiting}
                      running={running}
                      onDecide={onDecide}
                      compact={isSwimlane}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </main>
    </DragDropContext>
  )
}
