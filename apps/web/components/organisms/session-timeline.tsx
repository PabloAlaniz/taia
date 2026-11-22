'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import type { TranscriptEntry } from '@taia/types'
import { api } from '@/lib/api'
import { EmptyState, RackSection, SkeletonCard } from '../molecules'
import { TimelineItem } from '../molecules/timeline-item'

interface TimelineSession {
  agentId: string
  agentName?: string
  agentAvatar?: string
  sessionKey: string
  messages: TranscriptEntry[]
}

export function SessionTimeline() {
  const t = useTranslations('sessionsPage')
  const [sessions, setSessions] = useState<TimelineSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        const data = await api.sessions.active()
        const activeSessions = data.active || []

        // Fetch recent messages for each active session
        const sessionData: TimelineSession[] = []
        for (const session of activeSessions.slice(0, 5)) {
          try {
            const history = await api.sessions.history(session.key, {
              instance: session.instanceId,
              limit: 10,
            })
            if (history.ok) {
              sessionData.push({
                agentId: session.agentId,
                agentName: session.agentName,
                agentAvatar: session.agentAvatar,
                sessionKey: session.key,
                messages: history.messages || [],
              })
            }
          } catch {
            // Skip sessions that fail to load
          }
        }

        setSessions(sessionData)
        setError(null)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch timeline'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    fetchTimeline()
    const interval = setInterval(fetchTimeline, 10000)
    return () => clearInterval(interval)
  }, [])

  // Merge all messages into a single timeline, newest first.
  const allEntries = sessions
    .flatMap((s) =>
      s.messages.map((m) => ({
        ...m,
        agentName: s.agentName,
        agentAvatar: s.agentAvatar,
        agentId: s.agentId,
      })),
    )
    .sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return tb - ta
    })

  return (
    <RackSection title={t('timeline')} count={loading ? undefined : allEntries.length}>
      {loading ? (
        [1, 2, 3].map((i) => <SkeletonCard key={i} height="h-12" />)
      ) : error ? (
        <EmptyState onRack title={t('unavailable')} description={error} />
      ) : allEntries.length === 0 ? (
        <EmptyState onRack title={t('noActivity')} description={t('noneRunningHint')} />
      ) : (
        <div className="rounded-[2px] bg-strip px-4 py-3">
          {allEntries.map((entry, i) => (
            <TimelineItem
              key={entry.id || i}
              entry={entry}
              agentName={entry.agentName}
              agentAvatar={entry.agentAvatar}
              isLast={i === allEntries.length - 1}
            />
          ))}
        </div>
      )}
    </RackSection>
  )
}
