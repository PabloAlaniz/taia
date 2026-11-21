'use client'

import { useState, memo } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Task, Agent } from '@taia/types'
import { cn, PRIORITY_COLORS } from '../../lib/utils'
import { useStore } from '../../lib/store'
import { Button, Badge, Code, GitHubIcon, BlockerIcon } from '../atoms'
import { Card } from '../molecules'
import { shortTaskId } from '@taia/domain/domain/task/task-id'

interface TaskCardProps {
  task: Task
  agents: Agent[]
  isDragging?: boolean
  isSelected?: boolean
  isAssigning?: boolean
  onSelect?: () => void
  onAssign: (taskId: string, agentId: string) => void
  unresolvedBlockers?: number
}

export const TaskCard = memo(function TaskCard({
  task,
  agents,
  isDragging,
  isSelected,
  isAssigning,
  onSelect: _onSelect,
  onAssign,
  unresolvedBlockers,
}: TaskCardProps) {
  const t = useTranslations('taskCard')
  const router = useRouter()
  const tagColors = useStore((s) => s.tagColors)
  const [showAssign, setShowAssign] = useState(false)
  const assignedAgent = agents.find((a) => a.id === task.assigned_to)
  const availableAgents = agents.filter((a) => a.type !== 'orchestrator')

  const handleClick = () => {
    router.push(`/task/${task.id}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={t('aria', { title: task.title, priority: task.priority })}
      className={cn(
        'bg-card rounded-md p-2.5 cursor-pointer transition-all border-l-[3px]',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden',
        isDragging && 'rotate-2 shadow-lg',
        isSelected && 'ring-2 ring-accent',
        isAssigning && 'opacity-70',
      )}
      style={{ borderLeftColor: PRIORITY_COLORS[task.priority] }}
    >
      {/* Header with ID + repo link */}
      <div className="flex items-center gap-1.5 mb-1">
        <Code>{shortTaskId(task.id)}</Code>
        {(task.repo_url || task.primary_repo_url) && (
          <a
            href={task.repo_url || task.primary_repo_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted hover:text-foreground transition-colors ml-auto"
            title={t('openRepo')}
          >
            <GitHubIcon size={12} />
          </a>
        )}
      </div>

      {/* Title */}
      <h4 className="text-xs font-semibold leading-tight mb-1.5">{task.title}</h4>

      {/* Dependency blocker indicator */}
      {unresolvedBlockers !== undefined && unresolvedBlockers > 0 && (
        <div className="flex items-center gap-1 text-2xs text-red-400 mb-1">
          <BlockerIcon size={10} />
          <span>
            {unresolvedBlockers} bloqueo{unresolvedBlockers > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Assigned agent */}
      {assignedAgent && (
        <div className="flex items-center gap-1 text-2xs text-muted">
          <span>{assignedAgent.avatar}</span>
          <span>{assignedAgent.name}</span>
        </div>
      )}

      {/* Blocking tags - shown prominently */}
      {task.tags?.some((t) => t === 'blocked' || t === 'needs-clarification') && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.tags.includes('blocked') && <Badge variant="danger">🚫 blocked</Badge>}
          {task.tags.includes('needs-clarification') && (
            <Badge variant="warning">❓ needs-clarification</Badge>
          )}
        </div>
      )}

      {/* Project & other tags */}
      {(task.project || task.tags?.some((t) => t !== 'blocked' && t !== 'needs-clarification')) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.project && <Badge variant="accent">{task.project}</Badge>}
          {Array.from(new Set(task.tags))
            .filter((t) => t !== 'blocked' && t !== 'needs-clarification')
            .map((tag) => (
              <Badge key={tag} variant="default" color={tagColors[tag]}>
                #{tag}
              </Badge>
            ))}
        </div>
      )}

      {/* Assign button for INBOX tasks */}
      {task.status === 'INBOX' && !task.assigned_to && (
        <div className="mt-2 relative">
          <Button
            variant="primary"
            size="xs"
            disabled={isAssigning}
            onClick={(e) => {
              e.stopPropagation()
              setShowAssign(!showAssign)
            }}
            className="w-full"
          >
            {isAssigning ? '⏳...' : t('assign')}
          </Button>

          {showAssign && (
            <Card
              padding="none"
              className="absolute top-full left-0 right-0 mt-1 shadow-lg z-10 overflow-hidden"
            >
              {availableAgents.map((agent) => (
                <Button
                  key={agent.id}
                  variant="ghost"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowAssign(false)
                    onAssign(task.id, agent.id)
                  }}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xxs text-left rounded-none"
                >
                  <span>{agent.avatar}</span>
                  <span>{agent.name}</span>
                </Button>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  )
})
