'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/molecules/page-header'
import { ActiveSessionsGrid } from '@/components/organisms/active-sessions-grid'
import { SessionList } from '@/components/organisms/session-list'
import { SessionTimeline } from '@/components/organisms/session-timeline'
import { RuntimeNotice } from '@/components/organisms/runtime-notice'

type Tab = 'active' | 'history' | 'timeline'

export default function SessionsPage() {
  const tp = useTranslations('pageTitles')
  const t = useTranslations('sessionsPage')
  const [activeTab, setActiveTab] = useState<Tab>('active')
  const [activeCount, setActiveCount] = useState(0)

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'active', label: t('tabActive'), count: activeCount },
    { key: 'history', label: t('tabHistory') },
    { key: 'timeline', label: t('tabTimeline') },
  ]

  return (
    <div className="min-h-full">
      <PageHeader title={tp('sessions')}>
        <div
          role="tablist"
          aria-label={t('views')}
          className="flex rounded border border-border bg-card p-0.5"
        >
          {tabs.map((tab) => (
            // eslint-disable-next-line no-restricted-syntax -- segmented tab, not an action button
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-3 py-1 rounded-[3px] text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent',
                activeTab === tab.key
                  ? 'bg-foreground text-background'
                  : 'text-muted hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.count ? (
                <span className="ml-1.5 tabular-nums opacity-80">{tab.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="px-4 md:px-6 pt-4 pb-10 max-w-6xl mx-auto space-y-4">
        <p className="text-sm text-muted max-w-prose">{t('intro')}</p>
        <RuntimeNotice feature="sessions" />
        {activeTab === 'active' && <ActiveSessionsGrid onSessionCount={setActiveCount} />}
        {activeTab === 'history' && <SessionList />}
        {activeTab === 'timeline' && <SessionTimeline />}
      </div>
    </div>
  )
}
