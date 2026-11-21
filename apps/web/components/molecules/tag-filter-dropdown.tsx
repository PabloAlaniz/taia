'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '../atoms'
import { Dropdown } from './dropdown'
import { cn } from '../../lib/utils'

interface TagFilterDropdownProps {
  availableTags: string[]
  tagColors: Record<string, string>
  selectedTags: string[]
  onChange: (tags: string[]) => void
}

export function TagFilterDropdown({
  availableTags,
  tagColors,
  selectedTags,
  onChange,
}: TagFilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const t = useTranslations('filterDropdowns')

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter((t) => t !== tag))
    } else {
      onChange([...selectedTags, tag])
    }
  }

  const hasFilter = selectedTags.length > 0

  if (availableTags.length === 0) return null

  return (
    <div className="relative" ref={ref}>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => setOpen(!open)}
        className={cn(
          'text-xs border rounded-sm px-1.5 py-0.5 transition-colors',
          hasFilter
            ? 'bg-accent/15 text-accent border-accent/30'
            : 'bg-background text-foreground border-border hover:border-foreground/30',
        )}
      >
        {t('tags')}
        {hasFilter && (
          <span className="ml-1 bg-accent text-white text-2xs rounded-full w-4 h-4 inline-flex items-center justify-center">
            {selectedTags.length}
          </span>
        )}
        <span className="ml-1 text-2xs opacity-60">▾</span>
      </Button>

      <Dropdown open={open} align="left" className="min-w-[180px] max-h-64 overflow-y-auto">
        <div className="p-1">
          {availableTags.map((tag) => {
            const isSelected = selectedTags.includes(tag)
            const color = tagColors[tag]
            return (
              // eslint-disable-next-line no-restricted-syntax -- dropdown menu item, custom interaction
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 text-xs rounded-sm transition-colors flex items-center gap-2',
                  isSelected ? 'bg-accent/15 text-accent' : 'text-foreground hover:bg-card-hover',
                )}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 border border-border"
                  style={color ? { backgroundColor: color, borderColor: color } : undefined}
                />
                <span className="truncate">#{tag}</span>
                {isSelected && <span className="ml-auto">✓</span>}
              </button>
            )
          })}

          {hasFilter && (
            <>
              <div className="h-px bg-border my-1" />
              {/* eslint-disable-next-line no-restricted-syntax -- dropdown menu item, custom interaction */}
              <button
                onClick={() => onChange([])}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-sm text-muted hover:text-foreground hover:bg-card-hover transition-colors"
              >
                {t('clearAll')}
              </button>
            </>
          )}
        </div>
      </Dropdown>
    </div>
  )
}
