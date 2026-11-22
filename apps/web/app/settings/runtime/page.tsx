'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { PageHeader } from '@/components/molecules/page-header'
import { SectionCard } from '@/components/molecules/section-card'
import { RuntimeProviderForm } from '@/components/organisms/runtime-provider-form'

export default function RuntimeSettingsPage() {
  const tp = useTranslations('pageTitles')
  const t = useTranslations('runtime')
  const tc = useTranslations('settingsCommon')
  const [settings, setSettings] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/settings?prefix=runtime.', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setSettings(data.ok ? data.settings : {}))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return
        setSettings({})
      })
    return () => controller.abort()
  }, [])

  return (
    <div className="min-h-full bg-background">
      <PageHeader width="form" title={t('title')} backHref="/settings" backLabel={tp('settings')} />

      <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto">
        <SectionCard className="rounded-md" title={t('title')} description={t('pageDesc')}>
          {settings === null ? (
            <span className="text-sm text-muted" role="status" aria-busy="true">
              {tc('loadingPage')}
            </span>
          ) : (
            <RuntimeProviderForm initialSettings={settings} />
          )}
        </SectionCard>
      </div>
    </div>
  )
}
