'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Bot,
  Brain,
  ChevronRight,
  FolderGit2,
  GitBranch,
  Plug,
  ScrollText,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '@/components/molecules/card'
import { PageHeader } from '@/components/molecules/page-header'

interface Section {
  href: string
  icon: LucideIcon
  title: string
  description: string
}

export default function SettingsPage() {
  const t = useTranslations('settingsPage')
  const tp = useTranslations('pageTitles')
  const ti = useTranslations('settingsIndex')

  const sections: Section[] = [
    {
      href: '/settings/general',
      icon: Settings,
      title: tp('general'),
      description: ti('generalDesc'),
    },
    { href: '/settings/agents', icon: Bot, title: t('agentsTitle'), description: ti('agentsDesc') },
    {
      href: '/settings/runtime',
      icon: Plug,
      title: t('runtimeTitle'),
      description: ti('runtimeDesc'),
    },
    {
      href: '/settings/models',
      icon: Brain,
      title: t('modelsTitle'),
      description: ti('modelsDesc'),
    },
    { href: '/settings/team', icon: Users, title: tp('team'), description: ti('teamDesc') },
    {
      href: '/settings/projects',
      icon: FolderGit2,
      title: tp('projects'),
      description: ti('projectsDesc'),
    },
    {
      href: '/settings/profile',
      icon: UserRound,
      title: tp('profile'),
      description: ti('profileDesc'),
    },
    {
      href: '/settings/worktrees',
      icon: GitBranch,
      title: tp('worktrees'),
      description: ti('worktreesDesc'),
    },
    {
      href: '/settings/audit',
      icon: ScrollText,
      title: tp('audit'),
      description: ti('auditDesc'),
    },
  ]

  return (
    <div className="min-h-full bg-background">
      <PageHeader width="form" title={t('title')} />

      <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto">
        <p className="text-muted text-sm mb-6">{ti('intro')}</p>

        <div className="space-y-2">
          {sections.map((section) => {
            const Icon = section.icon
            return (
              <Link key={section.href} href={section.href} className="no-underline">
                <Card
                  variant="interactive"
                  padding="md"
                  className="rounded-lg flex items-center gap-4"
                >
                  <Icon className="w-5 h-5 shrink-0 text-muted" aria-hidden="true" />
                  <div>
                    <div className="font-medium text-foreground">{section.title}</div>
                    <div className="text-sm text-muted">{section.description}</div>
                  </div>
                  <ChevronRight className="ml-auto w-4 h-4 text-muted" aria-hidden="true" />
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
