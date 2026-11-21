'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@/components/atoms'
import { PageHeader } from '@/components/molecules/page-header'
import { ActiveSessionsGrid } from '@/components/organisms/active-sessions-grid'
import { SessionList } from '@/components/organisms/session-list'
import { SessionTimeline } from '@/components/organisms/session-timeline'

type Tab = 'active' | 'history' | 'timeline'

export default function SessionsPage() {
  const t = useTranslations('nav')
  const [activeTab, setActiveTab] = useState<Tab>('active')
  const [activeCount, setActiveCount] = useState(0)

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'active', label: 'Activas', icon: '🟢' },
    { key: 'history', label: 'Historial', icon: '📋' },
    { key: 'timeline', label: 'Timeline', icon: '⏱️' },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader title="Sesiones" icon="🎬" backLabel={`← ${t('board')}`}>
        {activeCount > 0 && (
          <span className="text-xs text-green-400">
            {activeCount} activa{activeCount !== 1 ? 's' : ''}
          </span>
        )}
      </PageHeader>

      {/* Tabs */}
      <div className="border-b border-border bg-card">
        <div className="flex gap-0 px-4">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              size="sm"
              variant={activeTab === tab.key ? 'primary' : 'secondary'}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'rounded-none border-b-2 -mb-px',
                activeTab === tab.key ? 'border-accent' : 'border-transparent',
              )}
            >
              {tab.icon} {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 pt-8 max-w-6xl mx-auto">
        {activeTab === 'active' && <ActiveSessionsGrid onSessionCount={setActiveCount} />}
        {activeTab === 'history' && <SessionList />}
        {activeTab === 'timeline' && <SessionTimeline />}
      </div>
    </div>
  )
}
