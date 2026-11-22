'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useWorkspaces, useActiveWorkspace, useSetActiveWorkspace } from '@/lib/store-selectors'
import { Button } from '../atoms'
import { Dropdown } from '../molecules/dropdown'
import { ChevronDown, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Workspace } from '@taia/types'

interface WorkspaceSwitcherProps {
  onCreateWorkspace?: () => void
}

export function WorkspaceSwitcher({ onCreateWorkspace }: WorkspaceSwitcherProps) {
  const t = useTranslations('shell.workspace')
  const workspaces = useWorkspaces()
  const activeWorkspace = useActiveWorkspace()
  const setActiveWorkspace = useSetActiveWorkspace()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelect = (ws: Workspace) => {
    setActiveWorkspace(ws.id)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      {/* Sits on the graphite bar, so it draws its own chrome. */}
      {/* eslint-disable-next-line no-restricted-syntax -- control on the dark rack, not a page button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded border border-rack-line px-2.5 py-1 text-sm font-medium text-[#e6eaed] hover:border-on-rack-muted focus-visible:outline-2 focus-visible:outline-white"
      >
        <span aria-hidden="true" className="w-2 h-2 rounded-[2px] bg-agent" />
        <span className="max-w-[140px] truncate">{activeWorkspace?.name || 'Default'}</span>
        <ChevronDown size={14} className="text-on-rack-muted" aria-hidden="true" />
      </button>

      <Dropdown open={open} className="w-56 py-1">
        {workspaces.map((ws) => (
          <Button
            key={ws.id}
            variant="ghost"
            size="sm"
            onClick={() => handleSelect(ws)}
            className={cn(
              'w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-strip transition-colors rounded-none justify-start',
              ws.id === activeWorkspace?.id && 'font-semibold bg-strip',
            )}
          >
            <span className="flex-1 truncate">{ws.name}</span>
            {ws.is_default && (
              <span className="text-xxs text-muted px-1 bg-background rounded-sm">
                {t('default')}
              </span>
            )}
          </Button>
        ))}
        <div className="border-t border-border mt-1 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false)
              onCreateWorkspace?.()
            }}
            className="w-full px-3 py-2 text-left text-sm text-accent hover:bg-strip transition-colors flex items-center gap-2 rounded-none justify-start"
          >
            <Plus size={14} aria-hidden="true" />
            <span>{t('newWorkspace')}</span>
          </Button>
        </div>
      </Dropdown>
    </div>
  )
}
