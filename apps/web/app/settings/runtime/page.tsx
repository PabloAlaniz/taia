'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Strip } from '@/components/atoms'
import { PageHeader } from '@/components/molecules/page-header'
import { RackSection } from '@/components/molecules/rack-section'
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

      <div className="mx-auto px-4 md:px-6 max-w-2xl pt-5 pb-10 space-y-4">
        <p className="text-sm text-muted max-w-prose">{t('pageDesc')}</p>

        <RackSection id="settings-runtime" title={t('connectionTitle')}>
          <Strip className="p-4">
            {settings === null ? (
              <span className="text-sm text-muted" role="status" aria-busy="true">
                {tc('loadingPage')}
              </span>
            ) : (
              <RuntimeProviderForm initialSettings={settings} />
            )}
          </Strip>
        </RackSection>
      </div>
    </div>
  )
}
