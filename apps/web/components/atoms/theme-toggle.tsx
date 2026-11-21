'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useIsClient } from '../../lib/use-is-client'
import { cn } from '../../lib/utils'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
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
        title="Light mode"
        aria-label="Light mode"
      >
        <Sun className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={cn(
          'p-1.5 rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden',
          theme === 'dark' ? 'bg-card text-foreground' : 'text-muted hover:text-foreground',
        )}
        title="Dark mode"
        aria-label="Dark mode"
      >
        <Moon className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button
        onClick={() => setTheme('system')}
        className={cn(
          'p-1.5 rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden',
          theme === 'system' ? 'bg-card text-foreground' : 'text-muted hover:text-foreground',
        )}
        title="System preference"
        aria-label="System preference"
      >
        <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
