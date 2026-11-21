'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'
import { Droppable, Draggable } from '@hello-pangea/dnd'
import { TaskCard } from './task-card'
import { Task, Agent, BoardColumn } from '@taia/types'
import { cn } from '../../lib/utils'
import { Badge } from '../atoms'

interface ColumnProps {
  column: BoardColumn
  droppableId?: string
  tasks: Task[]
  agents: Agent[]
  selectedTaskId: string | null
  assigning: string | null
  wipLimit?: number | null
  compact?: boolean
  onSelectTask: (taskId: string | null) => void
  onAssign: (taskId: string, agentId: string) => void
  onEditWipLimit?: (status: string) => void
}

export const Column = memo(function Column({
  column,
  droppableId,
  tasks,
  agents,
  selectedTaskId,
  assigning,
  wipLimit,
  compact = false,
  onSelectTask,
  onAssign,
  onEditWipLimit,
}: ColumnProps) {
  const t = useTranslations('board')
  const count = tasks.length
  const hasLimit = wipLimit != null && wipLimit > 0
  const percentage = hasLimit ? (count / wipLimit) * 100 : 0
  const isWarning = hasLimit && percentage >= 80 && percentage < 100
  const isExceeded = hasLimit && percentage >= 100

  const badgeVariant = isExceeded ? 'danger' : isWarning ? 'warning' : 'muted'

  return (
    <div
      className={cn(
        'flex flex-col flex-1 min-w-[180px] min-h-0',
        compact && 'min-w-[150px]',
        isExceeded && 'ring-2 ring-red-400 rounded-lg',
        isWarning && !isExceeded && 'ring-2 ring-yellow-400 rounded-lg',
      )}
    >
      {/* Header */}
      {/* eslint-disable-next-line no-restricted-syntax -- column header behaves as a click target with custom layout, not a primary action button */}
      <button
        type="button"
        className="flex justify-between items-center mb-2 px-2 cursor-pointer hover:opacity-80 w-full bg-transparent border-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden rounded-sm"
        onClick={() => onEditWipLimit?.(column.slug)}
        aria-label={t('columnAria', {
          name: column.label,
          count,
          hasLimit: hasLimit ? 'true' : 'false',
          limit: wipLimit ?? 0,
        })}
      >
        <span className="font-medium text-muted text-xs">
          {column.icon} {column.label}
        </span>
        <Badge variant={badgeVariant} size="xs">
          {count}
          {hasLimit ? `/${wipLimit}` : ''}
        </Badge>
      </button>

      {/* Droppable area */}
      <Droppable droppableId={droppableId || column.slug}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'p-2 space-y-1.5 rounded-md transition-all border-2 border-dashed flex-1 overflow-y-auto min-h-0',
              compact && 'min-h-[200px]',
              snapshot.isDraggingOver ? 'border-accent bg-accent/5' : 'border-transparent',
            )}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <TaskCard
                      task={task}
                      agents={agents}
                      isDragging={snapshot.isDragging}
                      isSelected={selectedTaskId === task.id}
                      isAssigning={assigning === task.id}
                      onSelect={() => onSelectTask(task.id)}
                      onAssign={onAssign}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
})
