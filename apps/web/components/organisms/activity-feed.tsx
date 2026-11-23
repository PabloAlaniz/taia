'use client'

import Link from 'next/link'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { Activity, Agent, Task } from '@taia/types'
import { cn } from '../../lib/utils'
import { actorName, participantKind } from '../../lib/format'
import { useActivityText } from '../../lib/use-activity-text'

interface ActivityFeedProps {
  activities: Activity[]
  agents: Agent[]
  tasks: Task[]
}

export function ActivityFeed({ activities, agents }: ActivityFeedProps) {
  const t = useTranslations('activity')
  const tActors = useTranslations('actors')
  const format = useFormatter()
  const describe = useActivityText()
  // One clock per minute, so relative times stay current without re-rendering per second.
  const now = useNow({ updateInterval: 60_000 })

  const getAgent = (agentId?: string) => {
    if (!agentId) return null
    return agents.find((a) => a.id === agentId)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <h2 className="text-xs font-semibold tracking-[0.08em] uppercase text-muted">
          {t('heading')}
        </h2>
      </div>

      <ol className="flex-1 overflow-y-auto px-2 py-2">
        {activities.length === 0 ? (
          <li className="text-muted text-sm px-2 py-6">{t('empty')}</li>
        ) : (
          activities.map((activity) => {
            const agent = getAgent(activity.agent_id)
            const kind = participantKind(agent)
            // Agents and people in their colour; TAIA's own actors (web UI, MCP…) in plain text.
            const who = actorName(activity.agent_id, agents, tActors)
            const body = (
              <>
                <div className="flex items-baseline gap-2 text-xs">
                  {who && (
                    <span
                      className={cn(
                        'font-semibold truncate',
                        kind === 'person'
                          ? 'text-person-ink'
                          : kind === 'agent'
                            ? 'text-agent-ink'
                            : 'text-foreground',
                      )}
                    >
                      {who}
                    </span>
                  )}
                  <time dateTime={activity.created_at} className="ml-auto shrink-0 text-muted">
                    {format.relativeTime(new Date(activity.created_at), now)}
                  </time>
                </div>
                <p className="text-sm leading-snug text-foreground/90 mt-0.5">
                  {describe(activity)}
                </p>
              </>
            )
            return (
              <li key={activity.id}>
                {activity.task_id ? (
                  <Link
                    href={`/task/${activity.task_id}`}
                    aria-label={t('openTaskAria', { message: describe(activity) })}
                    className="block rounded px-2 py-2 no-underline text-foreground hover:bg-strip focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="px-2 py-2">{body}</div>
                )}
              </li>
            )
          })
        )}
      </ol>
    </div>
  )
}
