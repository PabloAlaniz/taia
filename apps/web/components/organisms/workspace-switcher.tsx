'use client'

import { useState, useRef, useEffect } from 'react'
import { useWorkspaces, useActiveWorkspace, useSetActiveWorkspace } from '@/lib/store-selectors'
import { Button } from '../atoms'
import { Dropdown } from '../molecules/dropdown'
import { cn } from '../../lib/utils'
import type { Workspace } from '@taia/types'

interface WorkspaceSwitcherProps {
  onCreateWorkspace?: () => void
}

export function WorkspaceSwitcher({ onCreateWorkspace }: WorkspaceSwitcherProps) {
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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium"
      >
        <span>{activeWorkspace?.icon || '📋'}</span>
        <span className="max-w-[120px] truncate">{activeWorkspace?.name || 'Default'}</span>
        <span className="text-muted">▾</span>
      </Button>

      <Dropdown open={open} className="w-56 py-1">
        {workspaces.map((ws) => (
          <Button
            key={ws.id}
            variant="ghost"
            size="sm"
            onClick={() => handleSelect(ws)}
            className={cn(
              'w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-background transition-colors rounded-none justify-start',
              ws.id === activeWorkspace?.id && 'bg-accent/10 text-accent',
            )}
          >
            <span>{ws.icon}</span>
            <span className="flex-1 truncate">{ws.name}</span>
            {ws.is_default && (
              <span className="text-2xs text-muted px-1 bg-background rounded-sm">default</span>
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
            className="w-full px-3 py-2 text-left text-sm text-accent hover:bg-background transition-colors flex items-center gap-2 rounded-none justify-start"
          >
            <span>+</span>
            <span>Nuevo Workspace</span>
          </Button>
        </div>
      </Dropdown>
    </div>
  )
}
