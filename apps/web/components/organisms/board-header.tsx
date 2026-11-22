'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CalendarDays, PanelRight, Plus, Users, Wand2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button, IconButton } from '../atoms'

export type BoardView = 'all' | 'waiting'

interface BoardHeaderProps {
  taskCount: number
  activeAgents: number
  waitingCount: number
  view: BoardView
  onViewChange: (view: BoardView) => void
  isConnected: boolean
  loading: boolean
  showActivity: boolean
  showAgents: boolean
  onToggleActivity: () => void
  onToggleAgents: () => void
  onAddTask: () => void
  onPlanWizard: () => void
}

/** Title row of the board: counts, the waiting view, and the board's own actions. */
export function BoardHeader({
  taskCount,
  activeAgents,
  waitingCount,
  view,
  onViewChange,
  isConnected,
  loading,
  showActivity,
  showAgents,
  onToggleActivity,
  onToggleAgents,
  onAddTask,
  onPlanWizard,
}: BoardHeaderProps) {
  const t = useTranslations('boardHeader')

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:px-6 pt-4 pb-3 shrink-0">
      <IconButton
        onClick={onToggleAgents}
        variant={showAgents ? 'primary' : 'ghost'}
        aria-label={showAgents ? t('hideAgents') : t('showAgents')}
        aria-pressed={showAgents}
        className="lg:hidden"
      >
        <Users size={16} aria-hidden="true" />
      </IconButton>

      <div className="flex items-baseline gap-3 min-w-0">
        <h1 className="text-2xl font-semibold leading-none">{t('title')}</h1>
        <p className="text-sm text-muted whitespace-nowrap">
          {t('summary', { tasks: taskCount, agents: activeAgents })}
          <span className="mx-1.5" aria-hidden="true">
            ·
          </span>
          <span className={cn(!isConnected && 'text-person-ink font-medium')}>
            {loading ? t('syncing') : isConnected ? t('live') : t('polling')}
          </span>
        </p>
      </div>

      <div role="group" aria-label={t('viewLabel')} className="flex gap-1.5">
        <ViewChip active={view === 'all'} onClick={() => onViewChange('all')}>
          {t('viewAll')}
        </ViewChip>
        <ViewChip active={view === 'waiting'} onClick={() => onViewChange('waiting')}>
          {t('viewWaiting')}
          {waitingCount > 0 && (
            <span
              className={cn(
                'ml-1.5 rounded-[3px] px-1 tabular-nums text-xs font-bold',
                view === 'waiting' ? 'bg-person text-on-person' : 'bg-person/20 text-person-ink',
              )}
            >
              {waitingCount}
            </span>
          )}
        </ViewChip>
      </div>

      <div className="hidden lg:flex items-center gap-3 text-mid text-muted" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <i className="w-1 h-3 rounded-[1px] bg-agent" />
          {t('legendAgent')}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-1 h-3 rounded-[1px] bg-person" />
          {t('legendPerson')}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <IconButton aria-label={t('planWizard')} title={t('planWizard')} onClick={onPlanWizard}>
          <Wand2 size={16} aria-hidden="true" />
        </IconButton>
        <Link
          href="/calendar"
          aria-label={t('calendar')}
          title={t('calendar')}
          className="p-1.5 rounded text-muted hover:text-foreground hover:bg-strip focus-visible:outline-2 focus-visible:outline-accent"
        >
          <CalendarDays size={16} aria-hidden="true" />
        </Link>
        <IconButton
          aria-label={showActivity ? t('hideActivity') : t('showActivity')}
          title={showActivity ? t('hideActivity') : t('showActivity')}
          aria-pressed={showActivity}
          onClick={onToggleActivity}
          className="hidden xl:inline-flex"
        >
          <PanelRight size={16} aria-hidden="true" />
        </IconButton>
        <Button
          variant="primary"
          size="md"
          onClick={onAddTask}
          className="flex items-center gap-1.5"
        >
          <Plus size={15} aria-hidden="true" />
          {t('newTask')}
        </Button>
      </div>
    </div>
  )
}

function ViewChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant={active ? 'primary' : 'secondary'}
      size="sm"
      aria-pressed={active}
      onClick={onClick}
      className="flex items-center"
    >
      {children}
    </Button>
  )
}
