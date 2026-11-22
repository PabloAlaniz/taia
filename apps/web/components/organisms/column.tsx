'use client'

import { memo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Droppable, Draggable } from '@hello-pangea/dnd'
import { SlidersHorizontal } from 'lucide-react'
import { TaskCard } from './task-card'
import { Task, Agent, BoardColumn } from '@taia/types'
import { cn } from '../../lib/utils'
import { formatUsd } from '../../lib/format'
import type { ApprovalControls, WaitingReason } from '../../lib/use-board-signals'

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
  costs?: Record<string, number>
  waiting?: Record<string, WaitingReason>
  running?: Set<string>
  approvals?: ApprovalControls
}

/** A column as a graphite bay: strips sit in the rack, waiting ones stick out. */
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
  costs = {},
  waiting = {},
  running,
  approvals,
}: ColumnProps) {
  const t = useTranslations('board')
  const locale = useLocale()
  const count = tasks.length
  const hasLimit = wipLimit != null && wipLimit > 0
  const percentage = hasLimit ? (count / wipLimit) * 100 : 0
  const isWarning = hasLimit && percentage >= 80 && percentage < 100
  const isExceeded = hasLimit && percentage >= 100
  const total = tasks.reduce((sum, task) => sum + (costs[task.id] ?? 0), 0)
  const headingId = `bay-${droppableId || column.slug}`

  // Waiting strips first: they are the reason to look at the bay.
  const ordered = [...tasks].sort((a, b) => Number(!!waiting[b.id]) - Number(!!waiting[a.id]))

  return (
    <section
      aria-label={t('bayAria', { name: column.label, count })}
      className={cn(
        'flex flex-col flex-1 min-w-[220px] min-h-0 bg-rack rounded-md',
        compact && 'min-w-[200px]',
        isExceeded && 'outline-2 outline-alert',
        isWarning && !isExceeded && 'outline-2 outline-person',
      )}
    >
      <header className="flex items-baseline gap-2 pl-5 pr-2 pt-2.5 pb-2 border-b border-rack-line text-on-rack">
        <h2
          id={headingId}
          className="text-sm font-semibold tracking-[0.08em] uppercase text-rack-heading truncate"
        >
          {column.label}
        </h2>
        <span
          className={cn(
            'text-sm font-medium tabular-nums',
            isExceeded ? 'text-alert' : isWarning ? 'text-person' : 'text-on-rack-muted',
          )}
        >
          {count}
          {hasLimit ? `/${wipLimit}` : ''}
        </span>
        <span className="ml-auto text-mid tabular-nums text-on-rack-muted">
          {formatUsd(locale, total)}
        </span>
        {onEditWipLimit && (
          // eslint-disable-next-line no-restricted-syntax -- icon control on the dark rack, styled for it
          <button
            type="button"
            onClick={() => onEditWipLimit(column.slug)}
            aria-label={t('editWipLimit', { name: column.label })}
            title={t('editWipLimit', { name: column.label })}
            className="self-center p-1 rounded text-on-rack-muted hover:text-white hover:bg-rack-line focus-visible:outline-2 focus-visible:outline-white"
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
          </button>
        )}
      </header>

      <Droppable droppableId={droppableId || column.slug}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex flex-col gap-1.5 pl-5 pr-2.5 py-2.5 flex-1 overflow-y-auto min-h-0 transition-colors',
              compact && 'min-h-[160px]',
              snapshot.isDraggingOver && 'bg-rack-deep',
            )}
          >
            {ordered.map((task, index) => (
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
                      cost={costs[task.id]}
                      waiting={waiting[task.id]}
                      running={running?.has(task.id) ?? false}
                      approvals={approvals}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {count === 0 && !snapshot.isDraggingOver && (
              <p className="text-mid text-on-rack-muted py-3">{t('emptyBay')}</p>
            )}
          </div>
        )}
      </Droppable>
    </section>
  )
})
