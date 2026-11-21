'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import type { TranscriptEntry } from '@taia/types'
import { api } from '@/lib/api'
import { Badge } from '../atoms'
import { SkeletonCard } from '../molecules'
import { TimelineItem } from '../molecules/timeline-item'

interface TimelineSession {
  agentId: string
  agentName?: string
  agentAvatar?: string
  sessionKey: string
  messages: TranscriptEntry[]
}

export function SessionTimeline() {
  const tr = useTranslations('runtime')
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

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} height="h-20" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-2xl mb-2">⚠️</div>
        <div className="text-sm text-muted">{tr('unavailable')}</div>
        <div className="text-2xs text-muted mt-1">{error}</div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-3xl mb-2">📭</div>
        <div className="text-sm text-muted">No hay actividad reciente</div>
      </div>
    )
  }

  // Merge all messages into a single timeline, sorted by timestamp
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
    <div className="p-4">
      {/* Legend */}
      <div className="flex items-center gap-3 mb-4 text-2xs text-muted">
        <span>🔵 User</span>
        <span>🟢 Assistant</span>
        <span>🟠 Tools</span>
        <span>⚪ Thinking</span>
      </div>

      {/* Active agents */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {sessions.map((s) => (
          <Badge key={s.agentId} variant="secondary" size="sm">
            {s.agentAvatar || '🤖'} {s.agentName || s.agentId}
          </Badge>
        ))}
      </div>

      {/* Timeline */}
      <div>
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
    </div>
  )
}
