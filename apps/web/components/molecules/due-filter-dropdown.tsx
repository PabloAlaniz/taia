'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '../atoms'
import { Dropdown } from './dropdown'
import { cn } from '../../lib/utils'

type DueValue = 'today' | 'overdue' | 'this-week'

interface DueFilterDropdownProps {
  value: DueValue | undefined
  onChange: (value: DueValue | undefined) => void
}

const OPTIONS: { value: DueValue; icon: string; labelKey: string }[] = [
  { value: 'today', icon: '📅', labelKey: 'dueToday' },
  { value: 'overdue', icon: '⏰', labelKey: 'overdue' },
  { value: 'this-week', icon: '📆', labelKey: 'thisWeek' },
]

export function DueFilterDropdown({ value, onChange }: DueFilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const t = useTranslations('filterDropdowns')
  const tc = useTranslations('common')

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

  const activeOption = OPTIONS.find((o) => o.value === value)
  const label = activeOption ? t(activeOption.labelKey) : t('due')

  return (
    <div className="relative" ref={ref}>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => setOpen(!open)}
        className={cn(
          'text-xs border rounded-sm px-1.5 py-0.5 transition-colors',
          value
            ? 'bg-accent/15 text-accent border-accent/30'
            : 'bg-background text-foreground border-border hover:border-foreground/30',
        )}
      >
        {activeOption && <span className="mr-1">{activeOption.icon}</span>}
        {label}
        <span className="ml-1 text-2xs opacity-60">▾</span>
      </Button>

      <Dropdown open={open} align="left" className="min-w-[160px]">
        <div className="p-1">
          {/* All */}
          {/* eslint-disable-next-line no-restricted-syntax -- dropdown menu item, custom interaction */}
          <button
            onClick={() => {
              onChange(undefined)
              setOpen(false)
            }}
            className={cn(
              'w-full text-left px-2.5 py-1.5 text-xs rounded-sm transition-colors',
              !value ? 'bg-accent/15 text-accent' : 'text-foreground hover:bg-card-hover',
            )}
          >
            {tc('all')}
          </button>

          <div className="h-px bg-border my-1" />

          {OPTIONS.map((opt) => (
            // eslint-disable-next-line no-restricted-syntax -- dropdown menu item, custom interaction
            <button
              key={opt.value}
              onClick={() => {
                onChange(value === opt.value ? undefined : opt.value)
                setOpen(false)
              }}
              className={cn(
                'w-full text-left px-2.5 py-1.5 text-xs rounded-sm transition-colors flex items-center gap-1.5',
                value === opt.value
                  ? 'bg-accent/15 text-accent'
                  : 'text-foreground hover:bg-card-hover',
              )}
            >
              <span>{opt.icon}</span>
              <span>{t(opt.labelKey)}</span>
            </button>
          ))}
        </div>
      </Dropdown>
    </div>
  )
}
