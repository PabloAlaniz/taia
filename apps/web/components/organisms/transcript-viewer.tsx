'use client'

import { useState, useEffect, useRef } from 'react'
import type { SessionDetail } from '@taia/types'
import { api } from '@/lib/api'
import { useResource } from '@/lib/use-resource'
import { Button, Badge } from '../atoms'
import { TranscriptMessage } from '../molecules/transcript-message'

interface TranscriptViewerProps {
  sessionKey: string
  /** Runtime instance that owns the session, when known. */
  instanceId?: string
}

export function TranscriptViewer({ sessionKey, instanceId }: TranscriptViewerProps) {
  const [includeTools, setIncludeTools] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const {
    data: detail = null,
    loading,
    error,
    reload,
  } = useResource(
    `${instanceId ?? ''}|${sessionKey}|${includeTools}`,
    async (): Promise<SessionDetail | null> => {
      const data = await api.sessions.history(sessionKey, {
        instance: instanceId,
        limit: 200,
        include_tools: includeTools,
      })
      return data.ok ? data : null
    },
    {
      // Adaptive polling: live=3s, idle=10s, offline=stop
      refreshMs: (d) => (d?.status === 'live' ? 3000 : d?.status === 'idle' ? 10000 : 0),
      keepPreviousData: true,
    },
  )

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [detail?.messages?.length, autoScroll])

  // Detect scroll position
  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
    setAutoScroll(isNearBottom)
    setShowScrollButton(!isNearBottom)
  }

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      setAutoScroll(true)
      setShowScrollButton(false)
    }
  }

  const copyAsMarkdown = () => {
    if (!detail?.messages) return
    const md = detail.messages
      .map((m) => {
        if (m.role === 'user') return `**User:** ${m.text || ''}`
        const parts = m.parts
          ?.map((p) => {
            if (p.type === 'text') return p.text
            if (p.type === 'tool') return `\`🔧 ${p.name}\``
            if (p.type === 'thinking') return `_💭 ${(p.text || '').slice(0, 100)}_`
            return ''
          })
          .filter(Boolean)
          .join('\n')
        return `**Assistant:** ${parts || m.text || ''}`
      })
      .join('\n\n---\n\n')
    navigator.clipboard.writeText(md)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-muted animate-pulse">Cargando transcript...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <div className="text-2xl">⚠️</div>
        <div className="text-sm text-muted">{error}</div>
        <Button size="sm" onClick={reload}>
          Reintentar
        </Button>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-muted">Session not found</div>
      </div>
    )
  }

  const statusIcon = detail.status === 'live' ? '🟢' : detail.status === 'idle' ? '🟡' : '⚪'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border p-3 bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="font-medium text-sm flex items-center gap-2">
                <span>{statusIcon}</span>
                <span>{detail.agentName || detail.agentId}</span>
                {detail.status === 'live' && (
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                )}
              </div>
              <div className="text-2xs text-muted flex items-center gap-2 mt-0.5">
                {detail.label && <span>{detail.label}</span>}
                {detail.model && (
                  <Badge variant="secondary" size="xs">
                    {detail.model.split('/').pop()}
                  </Badge>
                )}
                {detail.totalTokens && <span>{formatTokensShort(detail.totalTokens)} tokens</span>}
                {detail.estimatedCostUsd !== undefined && detail.estimatedCostUsd > 0 && (
                  <span>${detail.estimatedCostUsd.toFixed(3)}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant={includeTools ? 'primary' : 'secondary'}
              onClick={() => setIncludeTools(!includeTools)}
              title="Toggle tool calls"
            >
              🔧
            </Button>
            <Button size="xs" onClick={copyAsMarkdown} title="Copy as markdown">
              📋
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3" onScroll={handleScroll}>
        {detail.messages.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">No messages in this session</div>
        ) : (
          detail.messages.map((entry, i) => <TranscriptMessage key={entry.id || i} entry={entry} />)
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="absolute bottom-4 right-4">
          <Button size="sm" onClick={scrollToBottom}>
            ↓ Ir al final
          </Button>
        </div>
      )}
    </div>
  )
}

function formatTokensShort(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}
