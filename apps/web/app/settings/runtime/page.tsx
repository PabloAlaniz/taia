'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { PageHeader } from '@/components/molecules/page-header'
import { SectionCard } from '@/components/molecules/section-card'
import { RuntimeProviderForm } from '@/components/organisms/runtime-provider-form'

export default function RuntimeSettingsPage() {
  const t = useTranslations('runtime')
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
    <div className="min-h-screen bg-background">
      <PageHeader title={t('title')} icon="🔌" backHref="/settings" />

      <div className="p-6 pt-8 max-w-2xl mx-auto">
        <SectionCard title={t('title')} description={t('pageDesc')}>
          {settings === null ? (
            <span className="text-2xl animate-pulse" aria-busy="true">
              ⏳
            </span>
          ) : (
            <RuntimeProviderForm initialSettings={settings} />
          )}
        </SectionCard>
      </div>
    </div>
  )
}
