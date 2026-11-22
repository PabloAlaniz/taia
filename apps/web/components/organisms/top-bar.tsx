'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Moon, Settings, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { MateMark } from '../atoms'
import { useIsClient } from '../../lib/use-is-client'
import { cn } from '../../lib/utils'
import { formatUsd } from '../../lib/format'
import { useLivePoller, useLiveStore, useWaiting } from '../../lib/use-shell-signals'
import { useRuntimeStatus, type RuntimeStatus } from '../../lib/use-runtime-status'
import { useStore } from '../../lib/store'
import { WorkspaceSwitcher } from './workspace-switcher'
import { UserSwitcher } from '../molecules/user-switcher'

const NAV = [
  { href: '/', key: 'board', match: (p: string) => p === '/' || p.startsWith('/task') },
  { href: '/sessions', key: 'sessions', match: (p: string) => p.startsWith('/sessions') },
  { href: '/projects', key: 'projects', match: (p: string) => p.startsWith('/projects') },
  {
    href: '/squad',
    key: 'agents',
    match: (p: string) => p.startsWith('/squad'),
  },
  { href: '/dashboard', key: 'dashboard', match: (p: string) => p.startsWith('/dashboard') },
] as const

const PROVIDER_NAMES: Record<string, string> = {
  openclaw: 'OpenClaw',
  anthropic: 'Claude API',
  'claude-code': 'Claude Code',
  aider: 'Aider',
  cursor: 'Cursor',
}

/**
 * The graphite bar over every page: where you are, what waits on you, what
 * today cost, and which runtime the agents run on.
 */
export function TopBar({ onCreateWorkspace }: { onCreateWorkspace?: () => void }) {
  const pathname = usePathname()
  const t = useTranslations('shell')
  const tn = useTranslations('nav')
  const locale = useLocale()
  useLivePoller()
  const waitingCount = Object.keys(useWaiting()).length
  const costToday = useLiveStore((s) => s.costToday)
  const runtime = useRuntimeStatus()

  // Pages other than the board don't load the store; the bar needs the
  // workspace list and the people (for the user switcher) everywhere.
  const hasWorkspaces = useStore((s) => s.workspaces.length > 0)
  const hasAgents = useStore((s) => s.agents.length > 0)
  const fetchWorkspaces = useStore((s) => s.fetchWorkspaces)
  const fetchAgents = useStore((s) => s.fetchAgents)
  const fetchTasks = useStore((s) => s.fetchTasks)
  useEffect(() => {
    if (!hasWorkspaces) fetchWorkspaces()
    if (!hasAgents) fetchAgents()
  }, [hasWorkspaces, hasAgents, fetchWorkspaces, fetchAgents])
  // The waiting count is computed over the workspace's tasks, like the board's.
  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  return (
    <header className="h-[52px] shrink-0 bg-rack border-b border-rack-deep text-on-rack flex items-center gap-2 sm:gap-3 md:gap-5 px-3 md:px-6 min-w-0">
      <Link
        href="/"
        className="flex items-center gap-2 font-bold text-lg tracking-[0.14em] text-white no-underline focus-visible:outline-2 focus-visible:outline-white rounded-sm"
      >
        <MateMark size={22} className="text-white [&_rect]:stroke-person" />
        <span className="hidden sm:inline">TAIA</span>
      </Link>
      <WorkspaceSwitcher onCreateWorkspace={onCreateWorkspace} />

      <nav aria-label={tn('mainNav')} className="hidden md:flex self-stretch gap-0.5">
        {NAV.map((item) => {
          const active = item.match(pathname)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center px-3 text-sm font-medium no-underline border-b-2 transition-colors',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
                active
                  ? 'text-white border-white'
                  : 'text-on-rack-muted border-transparent hover:text-white',
              )}
            >
              {tn(item.key)}
            </Link>
          )
        })}
      </nav>

      <div className="flex-1" />

      {waitingCount > 0 && (
        <Link
          href="/?view=waiting"
          aria-label={t('waitingAria', { count: waitingCount })}
          className="flex items-center gap-2 whitespace-nowrap rounded bg-person text-on-person font-bold text-sm pl-1 pr-2 sm:pl-1.5 sm:pr-2.5 py-1 no-underline hover:brightness-105 focus-visible:outline-2 focus-visible:outline-white"
        >
          <span className="rounded-[3px] bg-on-person text-person px-1.5 tabular-nums text-mid">
            {waitingCount}
          </span>
          <span className="text-xs sm:text-sm">{t('waiting', { count: waitingCount })}</span>
        </Link>
      )}

      {costToday !== null && (
        <span className="hidden lg:inline text-mid text-on-rack-muted">
          {t('last24h')}{' '}
          <b className="font-semibold text-on-rack tabular-nums">{formatUsd(locale, costToday)}</b>
        </span>
      )}

      <RuntimeChip status={runtime} />

      <ThemeSwitch />
      <Link
        href="/settings"
        aria-label={tn('settings')}
        title={tn('settings')}
        aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
        className={cn(
          'hidden md:block p-1.5 rounded hover:bg-rack-line hover:text-white focus-visible:outline-2 focus-visible:outline-white',
          pathname.startsWith('/settings') ? 'text-white bg-rack-line' : 'text-on-rack-muted',
        )}
      >
        <Settings size={17} aria-hidden="true" />
      </Link>
      <UserSwitcher />
    </header>
  )
}

/** The runtime, named, with its state in words: no unlabeled dots. */
function RuntimeChip({ status }: { status: RuntimeStatus }) {
  const t = useTranslations('shell.runtime')

  let label: string
  let dot: string
  if (!status.configured) {
    label = t('standalone')
    dot = 'bg-on-rack-muted'
  } else {
    const raw = status.provider ?? status.instances[0]?.provider
    const provider = raw ? (PROVIDER_NAMES[raw] ?? raw) : t('runtime')
    const extra = status.instances.length > 1 ? ` +${status.instances.length - 1}` : ''
    label = `${provider}${extra}`
    dot =
      status.state === 'connected'
        ? 'bg-ok'
        : status.state === 'connecting' || status.state === 'degraded'
          ? 'bg-person'
          : status.state === 'unknown'
            ? 'bg-on-rack-muted'
            : 'bg-alert'
  }
  const stateText = status.configured ? t(`state.${status.state}`) : t('standaloneHint')

  return (
    <Link
      href="/settings/runtime"
      title={stateText}
      className="hidden sm:flex items-center gap-2 rounded border border-rack-line px-2.5 py-1 text-mid font-medium text-on-rack no-underline hover:border-on-rack-muted focus-visible:outline-2 focus-visible:outline-white"
    >
      <span aria-hidden="true" className={cn('w-[7px] h-[7px] rounded-full', dot)} />
      <span className="max-w-36 truncate">{label}</span>
      <span className="sr-only">{stateText}</span>
    </Link>
  )
}

/** Light or dark in one click; "system" stays in Appearance settings. */
function ThemeSwitch() {
  const t = useTranslations('shell.theme')
  const { resolvedTheme, setTheme } = useTheme()
  const isClient = useIsClient()
  if (!isClient) return <span className="w-8" aria-hidden="true" />
  const dark = resolvedTheme === 'dark'
  return (
    // eslint-disable-next-line no-restricted-syntax -- icon control on the dark rack, styled for it
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? t('toLight') : t('toDark')}
      title={dark ? t('toLight') : t('toDark')}
      className="hidden md:block p-1.5 rounded text-on-rack-muted hover:text-white hover:bg-rack-line focus-visible:outline-2 focus-visible:outline-white"
    >
      {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  )
}
