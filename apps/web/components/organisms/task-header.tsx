'use client'

import { Task } from '@taia/types'
import { Button, Badge, Divider } from '../atoms'
import { PRIORITY_COLORS } from '../../lib/utils'
import { useStore } from '../../lib/store'
import { shortTaskId } from '@taia/domain/domain/task/task-id'

interface TaskHeaderProps {
  task: Task
  onBack: () => void
}

export function TaskHeader({ task, onBack }: TaskHeaderProps) {
  const priorityColor = PRIORITY_COLORS[task.priority]
  const tagColors = useStore((s) => s.tagColors)

  return (
    <header className="h-14 px-4 border-b border-border flex items-center justify-between bg-card shrink-0">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <span className="mr-1">←</span>
          Back
        </Button>

        <Divider orientation="vertical" />

        <div className="flex items-center gap-3">
          <code className="text-xs text-muted">#{shortTaskId(task.id)}</code>

          <span
            className="w-2 h-2 rounded-full"
            style={{ background: priorityColor }}
            title={task.priority}
          />

          {task.project && (
            <Badge variant="accent" size="sm">
              {task.project}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {Array.from(new Set(task.tags)).map((tag) => (
          <Badge key={tag} variant="secondary" size="sm" color={tagColors[tag]}>
            {tag}
          </Badge>
        ))}
      </div>
    </header>
  )
}
