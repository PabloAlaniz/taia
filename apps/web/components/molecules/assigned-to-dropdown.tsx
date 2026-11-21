'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Agent, Task } from '@taia/types'
import { Button } from '../atoms'
import { Dropdown } from './dropdown'
import { cn } from '../../lib/utils'

interface AssignedToDropdownProps {
  agents: Agent[]
  tasks: Task[]
  selectedAgentId: string | undefined
  showUnassigned: boolean
  onSelectAgent: (agentId: string | undefined) => void
  onSelectUnassigned: (value: boolean) => void
}

export function AssignedToDropdown({
  agents,
  tasks,
  selectedAgentId,
  showUnassigned,
  onSelectAgent,
  onSelectUnassigned,
}: AssignedToDropdownProps) {
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

  const getTaskCount = (agentId: string) =>
    tasks.filter((t) => t.assigned_to === agentId && t.status !== 'DONE').length

  const unassignedCount = tasks.filter((t) => !t.assigned_to && t.status !== 'DONE').length

  const selectedAgent = selectedAgentId ? agents.find((a) => a.id === selectedAgentId) : null
  const hasFilter = !!selectedAgentId || showUnassigned
  const label = showUnassigned
    ? t('unassigned')
    : selectedAgent
      ? selectedAgent.name
      : t('assignedTo')

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
        {hasFilter && <span className="mr-1">👤</span>}
        {label}
        <span className="ml-1 text-2xs opacity-60">▾</span>
      </Button>

      <Dropdown open={open} align="left" className="min-w-[200px] max-h-80 overflow-y-auto">
        <div className="p-1">
          {/* All */}
          {/* eslint-disable-next-line no-restricted-syntax -- dropdown menu item, custom interaction */}
          <button
            onClick={() => {
              onSelectAgent(undefined)
              onSelectUnassigned(false)
              setOpen(false)
            }}
            className={cn(
              'w-full text-left px-2.5 py-1.5 text-xs rounded-sm transition-colors',
              !hasFilter ? 'bg-accent/15 text-accent' : 'text-foreground hover:bg-card-hover',
            )}
          >
            {tc('all')}
          </button>

          <div className="h-px bg-border my-1" />

          {/* Agents */}
          {agents.map((agent) => {
            const count = getTaskCount(agent.id)
            const isSelected = selectedAgentId === agent.id
            return (
              // eslint-disable-next-line no-restricted-syntax -- dropdown menu item, custom interaction
              <button
                key={agent.id}
                onClick={() => {
                  onSelectAgent(isSelected ? undefined : agent.id)
                  onSelectUnassigned(false)
                  setOpen(false)
                }}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 text-xs rounded-sm transition-colors flex items-center justify-between gap-2',
                  isSelected ? 'bg-accent/15 text-accent' : 'text-foreground hover:bg-card-hover',
                )}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span>{agent.avatar || '🤖'}</span>
                  <span className="truncate">{agent.name}</span>
                  {agent.type === 'human' && (
                    <span className="text-2xs text-muted">({t('human')})</span>
                  )}
                </span>
                <span className="text-2xs text-muted shrink-0">{count}</span>
              </button>
            )
          })}

          <div className="h-px bg-border my-1" />

          {/* Unassigned */}
          {/* eslint-disable-next-line no-restricted-syntax -- dropdown menu item, custom interaction */}
          <button
            onClick={() => {
              onSelectAgent(undefined)
              onSelectUnassigned(!showUnassigned)
              setOpen(false)
            }}
            className={cn(
              'w-full text-left px-2.5 py-1.5 text-xs rounded-sm transition-colors flex items-center justify-between gap-2',
              showUnassigned ? 'bg-accent/15 text-accent' : 'text-foreground hover:bg-card-hover',
            )}
          >
            <span className="flex items-center gap-1.5">
              <span>📋</span>
              <span>{t('unassigned')}</span>
            </span>
            <span className="text-2xs text-muted">{unassignedCount}</span>
          </button>
        </div>
      </Dropdown>
    </div>
  )
}
