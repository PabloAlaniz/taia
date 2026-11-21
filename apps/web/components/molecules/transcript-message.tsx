'use client'

import { useState } from 'react'
import type { TranscriptEntry } from '@taia/types'
import { cn } from '../../lib/utils'

interface TranscriptMessageProps {
  entry: TranscriptEntry
  truncate?: boolean
}

export function TranscriptMessage({ entry, truncate = false }: TranscriptMessageProps) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const isUser = entry.role === 'user'
  const maxText = truncate ? 300 : undefined

  return (
    <div
      className={cn(
        'mb-2 p-2 rounded-md text-xs',
        isUser
          ? 'bg-blue-500/10 border border-blue-500/20'
          : 'bg-green-500/10 border border-green-500/20',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className={cn('font-medium text-2xs', isUser ? 'text-blue-400' : 'text-green-400')}>
          {isUser ? '👤 User' : '🤖 Assistant'}
        </span>
        <div className="flex items-center gap-2">
          {entry.model && (
            <span className="text-3xs text-muted">{entry.model.split('/').pop()}</span>
          )}
          {entry.timestamp && (
            <span className="text-3xs text-muted">
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
                className="flex items-center gap-1 cursor-pointer text-2xs text-muted hover:text-foreground"
              >
                <span>{thinkingExpanded ? '▼' : '▶'}</span>
                <span>💭 Thinking</span>
              </div>
              {thinkingExpanded && part.text && (
                <div className="mt-1 text-2xs text-muted leading-relaxed whitespace-pre-wrap">
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
            <div className="flex items-center gap-1.5 mt-0.5 p-1 rounded-sm bg-orange-500/10 border border-orange-500/20">
              <span className="text-orange-400 text-2xs">🔧</span>
              <code className="text-2xs text-orange-300 font-mono">{part.name}</code>
              {part.preview && (
                <span className="text-3xs text-muted truncate max-w-[200px]">{part.preview}</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
