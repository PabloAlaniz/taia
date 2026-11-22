'use client'

import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { MateMark } from '../atoms'
import { cn } from '../../lib/utils'

export type OnboardingStep = 'runtime' | 'project' | 'workspace'
const STEPS: OnboardingStep[] = ['runtime', 'project', 'workspace']

/**
 * First run: a graphite rack on the left holds the mark and the three steps as
 * strips (done, current, ahead); the step itself sits on the page beside it.
 */
export function OnboardingShell({
  step,
  children,
}: {
  /** Omit on the welcome screen: no step is current yet. */
  step?: OnboardingStep
  children: React.ReactNode
}) {
  const t = useTranslations('onboardingShell')
  const current = step ? STEPS.indexOf(step) : -1

  return (
    <div className="min-h-dvh grid md:grid-cols-[minmax(18rem,26rem)_1fr]">
      <aside className="bg-rack text-on-rack px-6 py-8 md:px-10 md:py-12 flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <MateMark size={40} className="text-white [&_rect]:stroke-person" />
          <div>
            <p className="text-2xl font-bold tracking-[0.14em] text-white leading-none">TAIA</p>
            <p className="text-sm text-on-rack-muted mt-1">{t('tagline')}</p>
          </div>
        </div>

        <ol className="flex flex-col gap-1.5" aria-label={t('progress')}>
          {STEPS.map((s, i) => {
            const done = i < current
            const active = i === current
            return (
              <li
                key={s}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'relative rounded-[2px] pl-4 pr-3 py-2.5 flex items-center gap-3',
                  active
                    ? 'bg-strip text-foreground -ml-3 shadow-[0_0_0_1px_var(--person),0_6px_14px_rgba(0,0,0,0.35)]'
                    : 'bg-rack-deep',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-y-0 left-0 w-[5px] rounded-l-[2px]',
                    active ? 'bg-person' : done ? 'bg-ok' : 'bg-rack-line',
                  )}
                />
                <span
                  className={cn(
                    'font-mono text-xs tabular-nums',
                    active ? 'text-muted' : 'text-on-rack-muted',
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex-1">
                  <span
                    className={cn(
                      'block text-sm font-semibold',
                      !active && 'text-rack-heading',
                      !active && !done && 'opacity-70',
                    )}
                  >
                    {t(`steps.${s}.title`)}
                  </span>
                  <span
                    className={cn('block text-xs', active ? 'text-muted' : 'text-on-rack-muted')}
                  >
                    {t(`steps.${s}.hint`)}
                  </span>
                </span>
                {done && <Check size={15} className="text-ok" aria-label={t('done')} />}
              </li>
            )
          })}
        </ol>

        <p className="mt-auto text-xs text-on-rack-muted max-w-xs">{t('footnote')}</p>
      </aside>

      <main id="main-content" className="flex items-center justify-center px-4 py-10 md:px-12">
        <div className="w-full max-w-xl">{children}</div>
      </main>
    </div>
  )
}
