'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Activity, Agent, Task } from '@taia/types'
import { ACTIVITY_ICONS, formatRelativeTime } from '../../lib/utils'

interface ActivityFeedProps {
  activities: Activity[]
  agents: Agent[]
  tasks: Task[]
}

export function ActivityFeed({ activities, agents }: ActivityFeedProps) {
  const t = useTranslations('activity')

  const getAgent = (agentId?: string) => {
    if (!agentId) return null
    return agents.find((a) => a.id === agentId)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <h3 className="text-base font-medium">{t('heading')}</h3>
        <p className="text-xs text-muted mt-1">{t('help')}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activities.length === 0 ? (
          <p className="text-muted text-center mt-8">{t('empty')}</p>
        ) : (
          activities.map((activity) => {
            const agent = getAgent(activity.agent_id)
            const hasLink = !!activity.task_id

            const content = (
              <div
                className={`flex gap-3 mb-4 pb-4 border-b border-border last:border-0 ${
                  hasLink
                    ? 'cursor-pointer hover:bg-muted/30 -mx-2 px-2 py-1 rounded-sm transition-colors'
                    : ''
                }`}
              >
                {/* Activity type icon */}
                <span className="text-xl shrink-0">
                  {ACTIVITY_ICONS[activity.type as keyof typeof ACTIVITY_ICONS] || '📌'}
                </span>

                <div className="flex-1 min-w-0">
                  {/* Agent info */}
                  {agent && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm">{agent.avatar}</span>
                      <span className="text-xs font-medium text-foreground">{agent.name}</span>
                    </div>
                  )}

                  {/* Message */}
                  <div className="text-sm leading-relaxed text-foreground/90">
                    {activity.message}
                  </div>

                  {/* Timestamp + link indicator */}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xxs text-muted">
                      {formatRelativeTime(activity.created_at)}
                    </span>
                    {hasLink && <span className="text-2xs text-accent">{t('openTask')}</span>}
                  </div>
                </div>
              </div>
            )

            // Wrap in Link if there's a task_id
            if (hasLink) {
              return (
                <Link key={activity.id} href={`/task/${activity.task_id}`}>
                  {content}
                </Link>
              )
            }

            return <div key={activity.id}>{content}</div>
          })
        )}
      </div>
    </div>
  )
}
