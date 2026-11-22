'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button, LocaleSwitcher } from '../atoms'
import { ThemeToggle } from '../atoms'
import { Dropdown } from './dropdown'

interface FontScale {
  scale: number
  increase: () => void
  decrease: () => void
  reset: () => void
  canIncrease: boolean
  canDecrease: boolean
}

interface AppearancePopoverProps {
  fontScale?: FontScale
}

export function AppearancePopover({ fontScale }: AppearancePopoverProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
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

  const t = useTranslations('appearance')
  const tl = useTranslations('settingsPage')

  return (
    <div className="relative" ref={ref}>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => setOpen(!open)}
        title={t('title')}
        aria-label={t('title')}
        aria-expanded={open}
        className="text-muted hover:text-foreground"
      >
        Aa
      </Button>

      <Dropdown open={open} align="right" className="p-3 min-w-[180px]">
        <div className="space-y-3">
          <div>
            <span className="text-2xs text-muted uppercase tracking-wide">{t('theme')}</span>
            <div className="mt-1">
              <ThemeToggle />
            </div>
          </div>

          <div>
            <span className="text-2xs text-muted uppercase tracking-wide">{tl('language')}</span>
            <div className="mt-1">
              <LocaleSwitcher />
            </div>
          </div>

          {fontScale && (
            <div>
              <span className="text-2xs text-muted uppercase tracking-wide">{t('fontScale')}</span>
              <div className="flex items-center gap-1 mt-1">
                <Button
                  size="xs"
                  onClick={fontScale.decrease}
                  disabled={!fontScale.canDecrease}
                  title={t('decreaseFont')}
                  aria-label={t('decreaseFont')}
                >
                  A-
                </Button>
                <Button
                  size="xs"
                  onClick={fontScale.reset}
                  title={t('resetFont')}
                  aria-label={`${t('resetFont')} (${Math.round(fontScale.scale * 100)}%)`}
                  className="min-w-12"
                >
                  {Math.round(fontScale.scale * 100)}%
                </Button>
                <Button
                  size="xs"
                  onClick={fontScale.increase}
                  disabled={!fontScale.canIncrease}
                  title={t('increaseFont')}
                  aria-label={t('increaseFont')}
                >
                  A+
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dropdown>
    </div>
  )
}
