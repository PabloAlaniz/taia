'use client'

import { useState } from 'react'
import type { TranscriptEntry, TranscriptPart } from '@taia/types'
import { cn } from '../../lib/utils'
import { Divider } from '../atoms'

interface TimelineItemProps {
  entry: TranscriptEntry
  agentName?: string
  agentAvatar?: string
  isLast?: boolean
}

const ROLE_STYLES = {
  user: { color: 'text-person-ink', bg: 'bg-person', icon: '' },
  assistant: { color: 'text-agent-ink', bg: 'bg-agent', icon: '' },
}

export function TimelineItem({ entry, agentName, isLast = false }: TimelineItemProps) {
  const [expanded, setExpanded] = useState(false)
  const style = ROLE_STYLES[entry.role]
  const hasExpandableContent = entry.parts?.some((p) => p.type === 'thinking' || p.type === 'tool')

  return (
    <div className="flex gap-3">
      {/* Vertical line + dot */}
      <div className="flex flex-col items-center">
        <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', style.bg)} />
        {!isLast && <Divider orientation="vertical" size="full" className="min-h-[16px]" />}
      </div>

      {/* Content */}
      <div className="flex-1 pb-3 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className={style.color}>
            {entry.role === 'user' ? 'User' : agentName || 'Agent'}
          </span>
          {entry.timestamp && (
            <span className="text-muted">{new Date(entry.timestamp).toLocaleTimeString()}</span>
          )}
          {hasExpandableContent && (
            <span
              onClick={() => setExpanded(!expanded)}
              className="text-muted hover:text-foreground cursor-pointer"
            >
              {expanded ? '▼' : '▶'}
            </span>
          )}
        </div>

        {/* Main text */}
        {entry.text && (
          <div className="text-xs text-foreground mt-0.5 leading-relaxed">
            {entry.text.slice(0, 200)}
            {entry.text.length > 200 && <span className="text-muted">...</span>}
          </div>
        )}

        {/* Parts summary / expanded */}
        {entry.parts?.map((part, i) => (
          <PartView key={i} part={part} expanded={expanded} />
        ))}
      </div>
    </div>
  )
}

function PartView({ part, expanded }: { part: TranscriptPart; expanded: boolean }) {
  if (part.type === 'text' && part.text) {
    return (
      <div className="text-xs text-foreground mt-0.5 leading-relaxed">
        {part.text.slice(0, 200)}
        {part.text.length > 200 && <span className="text-muted">...</span>}
      </div>
    )
  }

  if (part.type === 'tool') {
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <code className="text-xs text-person-ink font-mono">{part.name}</code>
        {expanded && part.preview && (
          <span className="text-xxs text-muted truncate max-w-[300px]">{part.preview}</span>
        )}
      </div>
    )
  }

  if (part.type === 'thinking' && expanded && part.text) {
    return (
      <div className="mt-1 p-1.5 rounded-sm bg-background/50 border border-border/50 text-xs text-muted leading-relaxed whitespace-pre-wrap">
        💭 {part.text.slice(0, 300)}
        {part.text.length > 300 && '...'}
      </div>
    )
  }

  if (part.type === 'thinking' && !expanded) {
    return (
      <div className="text-xs text-muted mt-0.5">
        💭 <span className="italic">thinking...</span>
      </div>
    )
  }

  return null
}
