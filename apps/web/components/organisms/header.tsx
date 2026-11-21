'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { cn } from '../../lib/utils'
import { Button, IconButton, StatusDot, Divider } from '../atoms'

import { WorkspaceSwitcher } from './workspace-switcher'
import { UserSwitcher } from '../molecules/user-switcher'
import type { RuntimeStatus } from '../../lib/use-runtime-status'

interface HeaderProps {
  isConnected: boolean
  runtimeStatus: RuntimeStatus
  loading: boolean
  showActivity: boolean
  showAgents?: boolean
  onToggleActivity: () => void
  onToggleAgents?: () => void
  onRefresh: () => void
  onAddTask: () => void
  onPlanWizard?: () => void
  onCreateWorkspace?: () => void
}

export function Header({
  isConnected,
  runtimeStatus,
  loading,
  showActivity,
  showAgents,
  onToggleActivity,
  onToggleAgents,
  onRefresh,
  onAddTask,
  onPlanWizard,
  onCreateWorkspace,
}: HeaderProps) {
  const tn = useTranslations('nav')
  const th = useTranslations('header')

  return (
    <header className="h-12 bg-card border-b border-border flex items-center justify-between px-3 md:px-4 shrink-0">
      {/* Left: Identity + Navigation */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile: Agent panel toggle */}
        {onToggleAgents && (
          <IconButton
            onClick={onToggleAgents}
            variant={showAgents ? 'primary' : 'ghost'}
            aria-label={showAgents ? th('hideAgents') : th('showAgents')}
            className="lg:hidden"
          >
            🤖
          </IconButton>
        )}
        <h1 className="text-base font-bold shrink-0">🧉 TAIA</h1>
        <WorkspaceSwitcher onCreateWorkspace={onCreateWorkspace} />
        {loading && (
          <span className="text-accent text-sm" aria-label={th('loading') || undefined}>
            ⏳
          </span>
        )}
        <StatusDot
          color={isConnected ? 'green' : 'red'}
          glow={isConnected}
          title={isConnected ? th('wsConnected') : th('wsDisconnected')}
        />
        <RuntimeStatusDot status={runtimeStatus} />
        <Divider orientation="vertical" size="lg" className="mx-1 hidden md:block" />
        <nav aria-label={tn('mainNav')} className="hidden md:flex items-center gap-2">
          <NavLink href="/dashboard" title={tn('dashboard')}>
            📊
          </NavLink>
          <NavLink href="/sessions" title={tn('sessions')}>
            🎬
          </NavLink>
          <NavLink href="/calendar" title={tn('calendar')}>
            📅
          </NavLink>
          <NavLink href="/settings" title={tn('settings')}>
            ⚙️
          </NavLink>
        </nav>
      </div>

      {/* Right: Board Actions */}
      <div className="flex items-center gap-1.5">
        {onPlanWizard && (
          <IconButton
            onClick={onPlanWizard}
            aria-label={th('planWizard')}
            className="hidden sm:inline-flex"
          >
            🧙
          </IconButton>
        )}
        <IconButton
          onClick={onToggleActivity}
          variant={showActivity ? 'primary' : 'secondary'}
          aria-label={showActivity ? th('hideActivity') : th('showActivity')}
          className="hidden sm:inline-flex"
        >
          📜
        </IconButton>
        <UserSwitcher />
        <IconButton onClick={onRefresh} aria-label={th('refresh')}>
          🔄
        </IconButton>
        <Button variant="primary" size="sm" onClick={onAddTask}>
          {th('newTask')}
        </Button>
      </div>
    </header>
  )
}

function NavLink({
  href,
  title,
  children,
}: {
  href: string
  title: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-label={title}
      className={cn(
        'bg-background border border-border rounded-md px-2 py-0.5',
        'text-foreground cursor-pointer text-xs no-underline',
        'flex items-center hover:bg-card transition-colors',
      )}
      title={title}
    >
      {children}
    </Link>
  )
}

/** Mobile-only bottom navigation bar */
export function MobileNav() {
  const t = useTranslations('nav')
  return (
    <nav
      aria-label={t('mobileNav')}
      className="md:hidden fixed bottom-0 left-0 right-0 h-12 bg-card border-t border-border flex items-center justify-around z-40"
    >
      <MobileNavLink href="/" title={t('board')}>
        🧉
      </MobileNavLink>
      <MobileNavLink href="/dashboard" title={t('dashboard')}>
        📊
      </MobileNavLink>
      <MobileNavLink href="/sessions" title={t('sessions')}>
        🎬
      </MobileNavLink>
      <MobileNavLink href="/calendar" title={t('calendar')}>
        📅
      </MobileNavLink>
      <MobileNavLink href="/settings" title={t('settingsShort')}>
        ⚙️
      </MobileNavLink>
    </nav>
  )
}

function MobileNavLink({
  href,
  title,
  children,
}: {
  href: string
  title: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-label={title}
      className="flex flex-col items-center justify-center gap-0.5 text-muted hover:text-foreground transition-colors min-w-[44px] min-h-[44px] no-underline"
    >
      <span className="text-lg">{children}</span>
      <span className="text-3xs">{title}</span>
    </Link>
  )
}

function RuntimeStatusDot({ status }: { status: RuntimeStatus }) {
  const t = useTranslations('runtime.status')

  if (!status.configured) {
    return <StatusDot color="gray" title={t('standalone')} />
  }

  // One instance reads as before; several get a summary plus one line each.
  const [single] = status.instances
  if (status.instances.length <= 1) {
    const provider = single?.provider ?? status.provider ?? ''
    if (status.state === 'connecting') {
      return <StatusDot color="yellow" pulse title={t('connecting', { provider })} />
    }
    return status.isConnected ? (
      <StatusDot color="green" glow title={t('connected', { provider })} />
    ) : (
      <StatusDot color="red" title={t('disconnected', { provider })} />
    )
  }

  const total = status.instances.length
  const connected = status.instances.filter((i) => i.state === 'connected').length
  const lines = status.instances.map((i) =>
    t('instance', { label: i.label, provider: i.provider, state: i.state }),
  )
  const title = (summary: string) => [summary, ...lines].join('\n')

  switch (status.state) {
    case 'connected':
      return <StatusDot color="green" glow title={title(t('allConnected', { total }))} />
    case 'degraded':
      return <StatusDot color="yellow" title={title(t('degraded', { connected, total }))} />
    case 'connecting':
      return <StatusDot color="yellow" pulse title={title(t('connectingMany', { total }))} />
    default:
      return <StatusDot color="red" title={title(t('allDisconnected', { total }))} />
  }
}
