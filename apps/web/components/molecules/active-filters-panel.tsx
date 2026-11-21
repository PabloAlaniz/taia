'use client'

import { useTranslations } from 'next-intl'
import type { SavedFilterConfig, Agent } from '@taia/types'

interface ActiveFiltersPanelProps {
  config: SavedFilterConfig
  agents: Agent[]
  tagColors: Record<string, string>
  onRemoveFilter: (key: keyof SavedFilterConfig, tagToRemove?: string) => void
  onClearAll: () => void
}

interface FilterChip {
  key: keyof SavedFilterConfig
  label: string
  icon?: string
  tag?: string
}

export function ActiveFiltersPanel({
  config,
  agents,
  tagColors,
  onRemoveFilter,
  onClearAll,
}: ActiveFiltersPanelProps) {
  const t = useTranslations('filterDropdowns')

  const chips: FilterChip[] = []

  if (config.assigned_to) {
    const agent = agents.find((a) => a.id === config.assigned_to)
    chips.push({
      key: 'assigned_to',
      label: agent ? agent.name : config.assigned_to,
      icon: agent?.avatar || '👤',
    })
  }

  if (config.unassigned) {
    chips.push({ key: 'unassigned', label: t('unassigned'), icon: '📋' })
  }

  if (config.due === 'today') {
    chips.push({ key: 'due', label: t('dueToday'), icon: '📅' })
  } else if (config.due === 'overdue') {
    chips.push({ key: 'due', label: t('overdue'), icon: '⏰' })
  } else if (config.due === 'this-week') {
    chips.push({ key: 'due', label: t('thisWeek'), icon: '📆' })
  }

  if (config.tags && config.tags.length > 0) {
    for (const tag of config.tags) {
      chips.push({ key: 'tags', label: `#${tag}`, tag })
    }
  }

  if (config.has_blockers) {
    chips.push({ key: 'has_blockers', label: t('blocked'), icon: '🚫' })
  }

  if (config.priority) {
    chips.push({ key: 'priority', label: `${t('priority')}: ${config.priority}` })
  }

  if (config.status) {
    chips.push({ key: 'status', label: `${t('status')}: ${config.status}` })
  }

  if (config.q) {
    chips.push({ key: 'q', label: `"${config.q}"`, icon: '🔍' })
  }

  if (chips.length === 0) return null

  return (
    <div className="bg-card/50 border-b border-border px-2 md:px-4 py-1 flex items-center gap-1.5 flex-wrap">
      <span className="text-2xs text-muted shrink-0">{t('activeFilters')}:</span>
      {chips.map((chip, i) => (
        <span
          key={`${chip.key}-${chip.tag || i}`}
          className="inline-flex items-center gap-1 bg-accent/10 text-accent text-2xs px-2 py-0.5 rounded-full border border-accent/20"
        >
          {chip.icon && <span>{chip.icon}</span>}
          {chip.key === 'tags' && chip.tag && tagColors[chip.tag] && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: tagColors[chip.tag] }}
            />
          )}
          <span>{chip.label}</span>
          {/* eslint-disable-next-line no-restricted-syntax -- inline chip-remove icon, not a standalone Button */}
          <button
            onClick={() => onRemoveFilter(chip.key, chip.tag)}
            className="ml-0.5 hover:text-foreground transition-colors"
            aria-label={`${t('remove')} ${chip.label}`}
          >
            ✕
          </button>
        </span>
      ))}
      {chips.length >= 2 && (
        // eslint-disable-next-line no-restricted-syntax -- inline link-style action, not a standalone Button
        <button
          onClick={onClearAll}
          className="text-2xs text-muted hover:text-foreground transition-colors ml-1"
        >
          {t('clearAll')}
        </button>
      )}
    </div>
  )
}
