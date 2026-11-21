'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  useCurrentUserId,
  useCurrentUserAgent,
  useSetCurrentUser,
  useHumanAgents,
} from '@/lib/store-selectors'
import { Button } from '../atoms'
import { Dropdown } from './dropdown'
import { cn } from '../../lib/utils'

export function UserSwitcher() {
  const currentUserId = useCurrentUserId()
  const currentUser = useCurrentUserAgent()
  const setCurrentUser = useSetCurrentUser()
  const humanAgents = useHumanAgents()
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

  // Auto-select if only one human agent and none selected
  useEffect(() => {
    if (!currentUserId && humanAgents.length === 1) {
      setCurrentUser(humanAgents[0].id)
    }
  }, [currentUserId, humanAgents, setCurrentUser])

  if (humanAgents.length === 0) {
    return (
      <Link
        href="/settings/team"
        className="text-2xs text-muted hover:text-accent transition-colors no-underline"
        title="Add team members"
      >
        👤 ?
      </Link>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium"
      >
        <span>{currentUser?.avatar || '👤'}</span>
        <span className="max-w-[100px] truncate">{currentUser?.name || 'Select user'}</span>
        <span className="text-muted">▾</span>
      </Button>

      <Dropdown open={open} className="w-48 py-1">
        {humanAgents.map((agent) => (
          <Button
            key={agent.id}
            variant="ghost"
            size="sm"
            onClick={() => {
              setCurrentUser(agent.id)
              setOpen(false)
            }}
            className={cn(
              'w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-background transition-colors rounded-none justify-start',
              agent.id === currentUserId && 'bg-accent/10 text-accent',
            )}
          >
            <span>{agent.avatar || '👤'}</span>
            <span className="flex-1 truncate">{agent.name}</span>
          </Button>
        ))}
        <div className="border-t border-border mt-1 pt-1">
          <Link
            href="/settings/team"
            onClick={() => setOpen(false)}
            className="w-full px-3 py-2 text-left text-sm text-accent hover:bg-background transition-colors flex items-center gap-2 no-underline"
          >
            <span>+</span>
            <span>Manage team</span>
          </Link>
        </div>
      </Dropdown>
    </div>
  )
}
