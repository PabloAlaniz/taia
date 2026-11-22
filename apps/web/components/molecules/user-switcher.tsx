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
import { ChevronDown, Plus, UserPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '../../lib/utils'

export function UserSwitcher() {
  const t = useTranslations('shell.user')
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
        className="p-1.5 rounded text-on-rack-muted hover:text-white hover:bg-rack-line focus-visible:outline-2 focus-visible:outline-white"
        aria-label={t('addTeam')}
        title={t('addTeam')}
      >
        <UserPlus size={17} aria-hidden="true" />
      </Link>
    )
  }

  return (
    <div className="relative" ref={ref}>
      {/* eslint-disable-next-line no-restricted-syntax -- control on the dark rack, not a page button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('switch', { name: currentUser?.name ?? '' })}
        className="flex items-center gap-1 rounded-full focus-visible:outline-2 focus-visible:outline-white"
      >
        <span className="w-7 h-7 rounded-full bg-person text-on-person grid place-items-center text-xs font-bold">
          {initials(currentUser?.name)}
        </span>
        <ChevronDown size={13} className="text-on-rack-muted" aria-hidden="true" />
      </button>

      <Dropdown open={open} align="right" className="w-52 py-1">
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
              'w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-strip transition-colors rounded-none justify-start',
              agent.id === currentUserId && 'font-semibold bg-strip',
            )}
          >
            <span className="w-5 h-5 rounded-full bg-person text-on-person grid place-items-center text-3xs font-bold">
              {initials(agent.name)}
            </span>
            <span className="flex-1 truncate">{agent.name}</span>
          </Button>
        ))}
        <div className="border-t border-border mt-1 pt-1">
          <Link
            href="/settings/team"
            onClick={() => setOpen(false)}
            className="w-full px-3 py-2 text-left text-sm text-accent hover:bg-strip transition-colors flex items-center gap-2 no-underline"
          >
            <Plus size={14} aria-hidden="true" />
            <span>{t('manageTeam')}</span>
          </Link>
        </div>
      </Dropdown>
    </div>
  )
}

function initials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return (parts[0][0] + (parts[1]?.[0] ?? parts[0][1] ?? '')).toUpperCase()
}
