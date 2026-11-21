'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { SavedFilter, SavedFilterConfig } from '@taia/types'
import { Button, Input } from '../atoms'
import { cn } from '../../lib/utils'

interface FilterBarProps {
  filters: SavedFilter[]
  activeFilterId: string | null
  onSelectFilter: (filterId: string | null) => void
  onCreateFilter: (data: { name: string; icon?: string; filter_config: SavedFilterConfig }) => void
  onDeleteFilter: (filterId: string) => void
}

export function FilterBar({
  filters,
  activeFilterId,
  onSelectFilter,
  onCreateFilter,
  onDeleteFilter,
}: FilterBarProps) {
  const t = useTranslations('filters')
  const tc = useTranslations('common')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')

  // Only show custom (non-predefined) filters
  const customFilters = filters.filter((f) => !f.is_predefined)

  const handleCreate = () => {
    if (!newName.trim()) return
    onCreateFilter({
      name: newName.trim(),
      icon: newIcon.trim() || undefined,
      filter_config: {},
    })
    setNewName('')
    setNewIcon('')
    setShowCreate(false)
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
      {/* Custom filter buttons */}
      {customFilters.map((filter) => (
        <div key={filter.id} className="relative group shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectFilter(activeFilterId === filter.id ? null : filter.id)}
            className={cn(
              'rounded-full border transition-colors flex items-center gap-1',
              activeFilterId === filter.id
                ? 'bg-accent text-white border-accent hover:bg-accent'
                : 'bg-transparent text-muted border-border hover:text-foreground hover:border-foreground/30 hover:bg-transparent',
            )}
          >
            {filter.icon && <span>{filter.icon}</span>}
            <span>{filter.name}</span>
          </Button>
          <Button
            variant="danger"
            size="xs"
            onClick={(e) => {
              e.stopPropagation()
              onDeleteFilter(filter.id)
            }}
            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-0 border-none hover:bg-red-600 hover:text-white"
            title={t('deleteFilter')}
          >
            ×
          </Button>
        </div>
      ))}

      {/* Create new filter */}
      {!showCreate ? (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setShowCreate(true)}
          className="shrink-0 text-muted hover:text-foreground hover:bg-transparent"
        >
          {t('saveFilter')}
        </Button>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          <Input
            type="text"
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            placeholder={t('iconPlaceholder')}
            className="w-10 text-xs"
            maxLength={2}
          />
          <Input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder={t('namePlaceholder')}
            className="w-32 text-xs"
            autoFocus
          />
          <Button variant="primary" size="xs" onClick={handleCreate}>
            {tc('save')}
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setShowCreate(false)}>
            {tc('cancel')}
          </Button>
        </div>
      )}
    </div>
  )
}
