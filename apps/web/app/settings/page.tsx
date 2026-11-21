'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Card } from '@/components/molecules/card'
import { PageHeader } from '@/components/molecules/page-header'

export default function SettingsPage() {
  const t = useTranslations('settingsPage')

  const sections = [
    {
      href: '/settings/general',
      icon: '⚙️',
      titleKey: 'General',
      descKey: 'generalDesc',
    },
    {
      href: '/settings/agents',
      icon: '🤖',
      titleKey: 'agentsTitle',
      descKey: 'agentsDesc',
    },
    {
      href: '/settings/runtime',
      icon: '🔌',
      titleKey: 'runtimeTitle',
      descKey: 'runtimeDesc',
    },
    {
      href: '/settings/models',
      icon: '🧠',
      titleKey: 'modelsTitle',
      descKey: 'modelsDesc',
    },
    {
      href: '/settings/team',
      icon: '👥',
      titleKey: 'teamTitle',
      descKey: 'teamDesc',
    },
    {
      href: '/settings/projects',
      icon: '📁',
      titleKey: 'projectsTitle',
      descKey: 'projectsDesc',
    },
    {
      href: '/settings/profile',
      icon: '👤',
      titleKey: 'User profile',
      descKey: 'What every agent knows about you',
    },
    {
      href: '/settings/worktrees',
      icon: '🌿',
      titleKey: 'Git Worktrees',
      descKey: 'worktreesDesc',
    },
    {
      href: '/settings/audit',
      icon: '🧾',
      titleKey: 'Settings audit',
      descKey: 'Workspace audit trail for settings and API keys',
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={t('title')} />

      <div className="p-6 pt-8 max-w-2xl mx-auto">
        <p className="text-muted text-sm mb-6">{t('generalDesc')}</p>

        <div className="space-y-2">
          {sections.map((section) => (
            <Link key={section.href} href={section.href} className="no-underline">
              <Card
                variant="interactive"
                padding="md"
                className="rounded-lg flex items-center gap-4"
              >
                <span className="text-2xl">{section.icon}</span>
                <div>
                  <div className="font-medium text-foreground">
                    {t.has(section.titleKey) ? t(section.titleKey) : section.titleKey}
                  </div>
                  <div className="text-sm text-muted">
                    {t.has(section.descKey) ? t(section.descKey) : section.descKey}
                  </div>
                </div>
                <span className="ml-auto text-muted">→</span>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
