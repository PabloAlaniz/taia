'use client'

import { useTranslations } from 'next-intl'
import { Select, Button, Divider, IconButton } from '../atoms'
import {
  AppearancePopover,
  AssignedToDropdown,
  DueFilterDropdown,
  TagFilterDropdown,
} from '../molecules'
import { FilterBar } from './filter-bar'
import type { GroupBy } from '../../lib/store'
import type { Agent, Task, Project, SavedFilter, SavedFilterConfig } from '@taia/types'
import { cn } from '../../lib/utils'

interface FontScale {
  scale: number
  increase: () => void
  decrease: () => void
  reset: () => void
  canIncrease: boolean
  canDecrease: boolean
}

interface BoardToolbarProps {
  groupBy: GroupBy
  onGroupByChange: (groupBy: GroupBy) => void
  projects: Project[]
  selectedProjectId: string | null
  onSelectProject: (id: string | null) => void
  // New filter system
  agents: Agent[]
  tasks: Task[]
  activeFilterConfig: SavedFilterConfig
  tagColors: Record<string, string>
  availableTags: string[]
  onSetFilterField: <K extends keyof SavedFilterConfig>(key: K, value: SavedFilterConfig[K]) => void
  onClearFilters: () => void
  // Saved custom filters (kept for custom user filters)
  savedFilters: SavedFilter[]
  activeFilterId: string | null
  onSelectFilter: (id: string | null) => void
  onCreateFilter: (data: { name: string; icon?: string; filter_config: SavedFilterConfig }) => void
  onDeleteFilter: (id: string) => void
  // Search
  onSearch?: () => void
  fontScale?: FontScale
}

export function BoardToolbar({
  groupBy,
  onGroupByChange,
  projects,
  selectedProjectId,
  onSelectProject,
  agents,
  tasks,
  activeFilterConfig,
  tagColors,
  availableTags,
  onSetFilterField,
  onClearFilters: _onClearFilters,
  savedFilters,
  activeFilterId,
  onSelectFilter,
  onCreateFilter,
  onDeleteFilter,
  onSearch,
  fontScale,
}: BoardToolbarProps) {
  const t = useTranslations('board')
  const tc = useTranslations('common')
  const tf = useTranslations('filterDropdowns')

  const hasBlockedFilter = !!activeFilterConfig.has_blockers

  return (
    <div className="min-h-9 bg-card border-b border-border flex items-center px-2 md:px-4 gap-2 md:gap-3 shrink-0 flex-wrap py-1">
      {/* Left: View Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-2xs text-muted hidden sm:inline">{t('groupLabel')}</span>
        <Select
          value={groupBy}
          onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
          className="text-xs bg-background border border-border rounded-sm px-1.5 py-0.5 text-foreground focus:outline-hidden focus:border-accent w-auto"
          aria-label={t('groupBy')}
        >
          <option value="none">{t('groupNone')}</option>
          <option value="agent">{t('groupAgent')}</option>
          <option value="project">{t('groupProject')}</option>
          <option value="priority">{t('groupPriority')}</option>
        </Select>

        {projects.length > 0 && (
          <>
            <Divider orientation="vertical" className="hidden sm:block" />
            <span className="text-2xs text-muted hidden sm:inline">{t('projectLabel')}</span>
            <Select
              value={selectedProjectId || ''}
              onChange={(e) => onSelectProject(e.target.value || null)}
              className="text-xs bg-background border border-border rounded-sm px-1.5 py-0.5 text-foreground focus:outline-hidden focus:border-accent w-auto hidden sm:block"
              aria-label={t('filterByProject')}
            >
              <option value="">{tc('all')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            {selectedProjectId && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onSelectProject(null)}
                className="hidden sm:inline-flex"
              >
                {tc('clear')}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Center: Filter Dropdowns */}
      <div className="flex items-center gap-1.5 flex-wrap hidden sm:flex">
        <Divider orientation="vertical" />

        <AssignedToDropdown
          agents={agents}
          tasks={tasks}
          selectedAgentId={activeFilterConfig.assigned_to}
          showUnassigned={!!activeFilterConfig.unassigned}
          onSelectAgent={(id) => {
            onSetFilterField('assigned_to', id)
            if (id) onSetFilterField('unassigned', undefined)
          }}
          onSelectUnassigned={(val) => {
            onSetFilterField('unassigned', val || undefined)
            if (val) onSetFilterField('assigned_to', undefined)
          }}
        />

        <DueFilterDropdown
          value={activeFilterConfig.due}
          onChange={(val) => onSetFilterField('due', val)}
        />

        <TagFilterDropdown
          availableTags={availableTags}
          tagColors={tagColors}
          selectedTags={activeFilterConfig.tags || []}
          onChange={(tags) => onSetFilterField('tags', tags.length > 0 ? tags : undefined)}
        />

        {/* Blocked toggle */}
        <Button
          size="xs"
          variant="ghost"
          onClick={() => onSetFilterField('has_blockers', hasBlockedFilter ? undefined : true)}
          className={cn(
            'text-xs border rounded-sm px-1.5 py-0.5 transition-colors',
            hasBlockedFilter
              ? 'bg-accent/15 text-accent border-accent/30'
              : 'bg-background text-foreground border-border hover:border-foreground/30',
          )}
        >
          🚫 {tf('blocked')}
        </Button>
      </div>

      {/* Custom saved filters */}
      {savedFilters.length > 0 && (
        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none hidden sm:block">
          <FilterBar
            filters={savedFilters}
            activeFilterId={activeFilterId}
            onSelectFilter={onSelectFilter}
            onCreateFilter={onCreateFilter}
            onDeleteFilter={onDeleteFilter}
          />
        </div>
      )}

      {/* Right: Search + Appearance */}
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        {onSearch && (
          <IconButton
            onClick={onSearch}
            aria-label={tf('search')}
            className="text-muted hover:text-foreground"
          >
            🔍
          </IconButton>
        )}
        <AppearancePopover fontScale={fontScale} />
      </div>
    </div>
  )
}
