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
import { Strip, type StripKind } from '@/components/atoms/strip'
import { PageHeader } from '@/components/molecules/page-header'
import { RackSection } from '@/components/molecules/rack-section'

interface Section {
  href: string
  icon: LucideIcon
  title: string
  description: string
  /** Participant pages carry their kind's edge tab. */
  kind?: StripKind
}

interface Group {
  id: string
  title: string
  sections: Section[]
}

export default function SettingsPage() {
  const t = useTranslations('settingsPage')
  const tp = useTranslations('pageTitles')
  const ti = useTranslations('settingsIndex')
  const th = useTranslations('settingsHub')

  const groups: Group[] = [
    {
      id: 'settings-work',
      title: th('groupWork'),
      sections: [
        {
          href: '/settings/agents',
          icon: Bot,
          title: t('agentsTitle'),
          description: ti('agentsDesc'),
          kind: 'agent',
        },
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
        {
          href: '/settings/worktrees',
          icon: GitBranch,
          title: tp('worktrees'),
          description: ti('worktreesDesc'),
        },
      ],
    },
    {
      id: 'settings-people',
      title: th('groupPeople'),
      sections: [
        {
          href: '/settings/team',
          icon: Users,
          title: tp('team'),
          description: ti('teamDesc'),
          kind: 'person',
        },
        {
          href: '/settings/profile',
          icon: UserRound,
          title: tp('profile'),
          description: ti('profileDesc'),
        },
        {
          href: '/settings/projects',
          icon: FolderGit2,
          title: tp('projects'),
          description: ti('projectsDesc'),
        },
      ],
    },
    {
      id: 'settings-system',
      title: th('groupSystem'),
      sections: [
        {
          href: '/settings/general',
          icon: Settings,
          title: tp('general'),
          description: ti('generalDesc'),
        },
        {
          href: '/settings/audit',
          icon: ScrollText,
          title: tp('audit'),
          description: ti('auditDesc'),
        },
      ],
    },
  ]

  return (
    <div className="min-h-full bg-background">
      <PageHeader width="form" title={t('title')} />

      <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto space-y-4">
        <p className="text-muted text-sm max-w-prose">{ti('intro')}</p>

        {groups.map((group) => (
          <RackSection key={group.id} id={group.id} title={group.title}>
            <ul className="flex flex-col gap-1.5">
              {group.sections.map((section) => {
                const Icon = section.icon
                return (
                  <li key={section.href}>
                    <Strip kind={section.kind} className="p-0 hover:bg-card transition-colors">
                      <Link
                        href={section.href}
                        className="group flex items-center gap-3 pl-4 pr-3 py-2.5 no-underline text-foreground rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <Icon size={16} className="shrink-0 text-muted" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{section.title}</span>
                          <span className="block text-mid text-muted">{section.description}</span>
                        </span>
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-muted group-hover:text-foreground"
                          aria-hidden="true"
                        />
                      </Link>
                    </Strip>
                  </li>
                )
              })}
            </ul>
          </RackSection>
        ))}
      </div>
    </div>
  )
}
