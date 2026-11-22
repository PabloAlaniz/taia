'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { BarChart3, FolderKanban, LayoutGrid, PlayCircle, Settings, Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useChromeStore } from '../../lib/chrome'
import { TopBar } from '../organisms/top-bar'
import { CreateWorkspaceModal } from '../organisms/create-workspace-modal'

/** Routes that render without the app chrome. */
const BARE = ['/login']

/**
 * Every page sits under the graphite top bar; the page itself scrolls inside
 * the remaining height. Phones get a bottom tab bar instead of the nav tabs.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hidden = useChromeStore((s) => s.hidden > 0)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)

  // Children keep the same position in the tree whether or not the chrome
  // shows: hiding it must never remount the page (and reset its state).
  const bare = hidden || BARE.some((p) => pathname.startsWith(p))

  return (
    <div className={bare ? undefined : 'flex flex-col h-dvh'}>
      {!bare && <TopBar onCreateWorkspace={() => setCreatingWorkspace(true)} />}
      <div className={bare ? undefined : 'flex-1 min-h-0 overflow-auto pb-14 md:pb-0'}>
        {children}
      </div>
      {!bare && <MobileNav pathname={pathname} />}
      {!bare && (
        <CreateWorkspaceModal
          open={creatingWorkspace}
          onClose={() => setCreatingWorkspace(false)}
        />
      )}
    </div>
  )
}

const MOBILE = [
  { href: '/', key: 'board', Icon: LayoutGrid },
  { href: '/sessions', key: 'sessions', Icon: PlayCircle },
  { href: '/projects', key: 'projects', Icon: FolderKanban },
  { href: '/squad', key: 'agents', Icon: Users },
  { href: '/dashboard', key: 'dashboard', Icon: BarChart3 },
  { href: '/settings', key: 'settingsShort', Icon: Settings },
] as const

function MobileNav({ pathname }: { pathname: string }) {
  const t = useTranslations('nav')
  return (
    <nav
      aria-label={t('mobileNav')}
      className="md:hidden fixed bottom-0 inset-x-0 h-14 bg-rack border-t border-rack-deep flex items-stretch justify-around z-40"
    >
      {MOBILE.map(({ href, key, Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 min-w-11 px-1 text-xxs font-medium no-underline',
              active ? 'text-white' : 'text-on-rack-muted',
            )}
          >
            <Icon size={18} aria-hidden="true" />
            {t(key)}
          </Link>
        )
      })}
    </nav>
  )
}
