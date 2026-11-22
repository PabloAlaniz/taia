'use client'

import { useState, useEffect, useRef } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { AlertTriangle, ArrowDown, Check, Copy, Wrench } from 'lucide-react'
import type { SessionDetail } from '@taia/types'
import { api } from '@/lib/api'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'
import { Button, Badge } from '../atoms'
import { TranscriptMessage } from '../molecules/transcript-message'

interface TranscriptViewerProps {
  sessionKey: string
  /** Runtime instance that owns the session, when known. */
  instanceId?: string
}

export function TranscriptViewer({ sessionKey, instanceId }: TranscriptViewerProps) {
  const t = useTranslations('transcript')
  const tStatus = useTranslations('sessionsPage.status')
  const format = useFormatter()
  const [includeTools, setIncludeTools] = useState(true)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
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

  const copyAsMarkdown = async () => {
    if (!detail?.messages) return
    const md = detail.messages
      .map((m) => {
        if (m.role === 'user') return `**${t('mdUser')}:** ${m.text || ''}`
        const parts = m.parts
          ?.map((p) => {
            if (p.type === 'text') return p.text
            if (p.type === 'tool') return `\`${t('mdTool', { name: p.name ?? '' })}\``
            if (p.type === 'thinking')
              return `_${t('mdThinking', { text: (p.text || '').slice(0, 100) })}_`
            return ''
          })
          .filter(Boolean)
          .join('\n')
        return `**${t('mdAssistant')}:** ${parts || m.text || ''}`
      })
      .join('\n\n---\n\n')
    try {
      await navigator.clipboard.writeText(md)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    setTimeout(() => setCopyState('idle'), 2000)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-muted animate-pulse">{t('loading')}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" className="flex-1 flex flex-col items-center justify-center gap-2">
        <AlertTriangle size={20} aria-hidden className="text-alert" />
        <div className="text-sm">{t('loadFailed')}</div>
        <div className="text-xs text-muted">{error}</div>
        <Button size="sm" onClick={reload}>
          {t('retry')}
        </Button>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center">
        <div className="text-sm">{t('notFound')}</div>
        <div className="text-xs text-muted">{t('notFoundHint')}</div>
      </div>
    )
  }

  const statusDot =
    detail.status === 'live' ? 'bg-ok' : detail.status === 'idle' ? 'bg-person-ink' : 'bg-muted'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border p-3 bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="font-medium text-sm flex items-center gap-2">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    statusDot,
                    detail.status === 'live' && 'animate-pulse',
                  )}
                  aria-hidden
                />
                <span>{detail.agentName || detail.agentId}</span>
                <span className="text-2xs font-normal text-muted">{tStatus(detail.status)}</span>
              </div>
              <div className="text-2xs text-muted flex items-center gap-2 mt-0.5">
                {detail.label && <span>{detail.label}</span>}
                {detail.model && (
                  <Badge variant="secondary" size="xs">
                    {detail.model.split('/').pop()}
                  </Badge>
                )}
                {detail.totalTokens ? (
                  <span>
                    {t('tokens', {
                      count: format.number(detail.totalTokens, {
                        notation: 'compact',
                        maximumFractionDigits: 1,
                      }),
                    })}
                  </span>
                ) : null}
                {detail.estimatedCostUsd !== undefined && detail.estimatedCostUsd > 0 && (
                  <span>
                    {format.number(detail.estimatedCostUsd, {
                      style: 'currency',
                      currency: 'USD',
                      maximumFractionDigits: 3,
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant={includeTools ? 'primary' : 'secondary'}
              onClick={() => setIncludeTools(!includeTools)}
              aria-pressed={includeTools}
              aria-label={includeTools ? t('hideTools') : t('showTools')}
              title={includeTools ? t('hideTools') : t('showTools')}
            >
              <Wrench size={14} aria-hidden />
            </Button>
            <Button size="xs" onClick={copyAsMarkdown} aria-label={t('copy')} title={t('copy')}>
              {copyState === 'copied' ? (
                <Check size={14} aria-hidden className="text-ok" />
              ) : (
                <Copy size={14} aria-hidden />
              )}
            </Button>
            <span role="status" aria-live="polite" className="text-2xs">
              {copyState === 'copied' && <span className="text-ok">{t('copied')}</span>}
              {copyState === 'failed' && <span className="text-alert">{t('copyFailed')}</span>}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3" onScroll={handleScroll}>
        {detail.messages.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">{t('empty')}</div>
        ) : (
          detail.messages.map((entry, i) => <TranscriptMessage key={entry.id || i} entry={entry} />)
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="absolute bottom-4 right-4">
          <Button size="sm" onClick={scrollToBottom}>
            <ArrowDown size={14} aria-hidden className="mr-1" />
            {t('scrollToEnd')}
          </Button>
        </div>
      )}
    </div>
  )
}
