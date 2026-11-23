'use client'

import { useState } from 'react'
import type { TranscriptEntry } from '@taia/types'
import { useTranslations } from 'next-intl'
import { Brain, Wrench } from 'lucide-react'
import { cn } from '../../lib/utils'

interface TranscriptMessageProps {
  entry: TranscriptEntry
  truncate?: boolean
}

export function TranscriptMessage({ entry, truncate = false }: TranscriptMessageProps) {
  const t = useTranslations('transcript')
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const isUser = entry.role === 'user'
  const maxText = truncate ? 300 : undefined

  return (
    <div
      className={cn(
        // A strip per message: person tab for the user, agent tab for the model.
        'relative mb-2 pl-4 pr-3 py-2 rounded-[2px] text-xs bg-strip',
        'before:absolute before:inset-y-0 before:left-0 before:w-[5px] before:rounded-l-[2px] before:content-[""]',
        isUser ? 'before:bg-person' : 'before:bg-agent',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span
          className={cn('font-semibold text-xs', isUser ? 'text-person-ink' : 'text-agent-ink')}
        >
          {isUser ? t('mdUser') : t('mdAssistant')}
        </span>
        <div className="flex items-center gap-2">
          {entry.model && (
            <span className="text-xxs text-muted">{entry.model.split('/').pop()}</span>
          )}
          {entry.timestamp && (
            <span className="text-xxs text-muted">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* User text */}
      {entry.text && (
        <div className="text-foreground leading-relaxed whitespace-pre-wrap wrap-break-word">
          {maxText ? (
            <>
              {entry.text.slice(0, maxText)}
              {entry.text.length > maxText && <span className="text-muted">...</span>}
            </>
          ) : (
            entry.text
          )}
        </div>
      )}

      {/* Assistant parts */}
      {entry.parts?.map((part, i) => (
        <div key={i} className="mt-1">
          {part.type === 'thinking' && (
            <div className="border border-border/50 rounded-sm p-1.5 bg-background/50">
              <div
                onClick={() => setThinkingExpanded(!thinkingExpanded)}
                className="flex items-center gap-1 cursor-pointer text-xs text-muted hover:text-foreground"
              >
                <span>{thinkingExpanded ? '▼' : '▶'}</span>
                <Brain size={12} aria-hidden="true" />
                <span>{t('thinking')}</span>
              </div>
              {thinkingExpanded && part.text && (
                <div className="mt-1 text-xs text-muted leading-relaxed whitespace-pre-wrap">
                  {maxText ? part.text.slice(0, maxText) : part.text}
                  {maxText && part.text.length > maxText && <span>...</span>}
                </div>
              )}
            </div>
          )}
          {part.type === 'text' && part.text && (
            <div className="text-foreground leading-relaxed whitespace-pre-wrap wrap-break-word">
              {maxText ? (
                <>
                  {part.text.slice(0, maxText)}
                  {part.text.length > maxText && <span className="text-muted">...</span>}
                </>
              ) : (
                part.text
              )}
            </div>
          )}
          {part.type === 'tool' && (
            <div className="flex items-center gap-1.5 mt-0.5 px-1.5 py-1 rounded-sm bg-card border border-border">
              <Wrench size={12} className="text-muted" aria-hidden="true" />
              <code className="text-xs text-foreground font-mono">{part.name}</code>
              {part.preview && (
                <span className="text-xxs text-muted truncate max-w-[200px]">{part.preview}</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
