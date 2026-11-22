'use client'

import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useIsClient } from '../../lib/use-is-client'
import { cn } from '../../lib/utils'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const t = useTranslations('appearanceUi')
  const isClient = useIsClient()
  if (!isClient) return null

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-background border border-border">
      <button
        onClick={() => setTheme('light')}
        className={cn(
          'p-1.5 rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden',
          theme === 'light' ? 'bg-card text-foreground' : 'text-muted hover:text-foreground',
        )}
        title={t('light')}
        aria-label={t('light')}
        aria-pressed={theme === 'light'}
      >
        <Sun className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={cn(
          'p-1.5 rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden',
          theme === 'dark' ? 'bg-card text-foreground' : 'text-muted hover:text-foreground',
        )}
        title={t('dark')}
        aria-label={t('dark')}
        aria-pressed={theme === 'dark'}
      >
        <Moon className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button
        onClick={() => setTheme('system')}
        className={cn(
          'p-1.5 rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden',
          theme === 'system' ? 'bg-card text-foreground' : 'text-muted hover:text-foreground',
        )}
        title={t('system')}
        aria-label={t('system')}
        aria-pressed={theme === 'system'}
      >
        <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
