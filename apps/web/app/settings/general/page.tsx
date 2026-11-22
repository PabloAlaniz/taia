'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button, Input } from '@/components/atoms'
import { PageHeader } from '@/components/molecules/page-header'
import { fetchJson } from '@/lib/use-resource'
import { SectionCard } from '@/components/molecules/section-card'

export default function GeneralSettingsPage() {
  const tp = useTranslations('pageTitles')
  const t = useTranslations('settingsGeneral')
  const tc = useTranslations('settingsCommon')
  const tCommon = useTranslations('common')
  const [wsUrl, setWsUrl] = useState('ws://localhost:13334')
  const [defaultTz, setDefaultTz] = useState('UTC')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetchJson<{ ok: boolean; settings: Record<string, string> }>('/api/settings?prefix=app.')
      .then((data) => {
        if (!data.ok) return
        const s = data.settings
        if (s['app.ws_url']) setWsUrl(s['app.ws_url'])
        if (s['app.default_tz']) setDefaultTz(s['app.default_tz'])
      })
      .catch((e) => console.error('Failed to fetch settings:', e))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            'app.ws_url': wsUrl,
            'app.default_tz': defaultTz,
          },
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setSaveMessage({ ok: true, text: tc('saved') })
        setTimeout(() => setSaveMessage(null), 3000)
      } else {
        setSaveMessage({ ok: false, text: tc('saveFailed', { error: String(data.error) }) })
      }
    } catch (e) {
      setSaveMessage({
        ok: false,
        text: tc('saveFailed', { error: e instanceof Error ? e.message : String(e) }),
      })
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-full bg-background">
        <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto">
          <span className="text-muted text-sm" role="status">
            {tc('loadingPage')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <PageHeader
        width="form"
        title={tp('general')}
        backHref="/settings"
        backLabel={tp('settings')}
      />

      <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto space-y-8">
        {/* WebSocket Section */}
        <SectionCard
          className="rounded-md"
          title={t('websocketTitle')}
          description={t('websocketDesc')}
        >
          <div>
            <label htmlFor="settings-ws-url" className="text-xs text-muted block mb-1">
              {t('wsUrlLabel')}
            </label>
            <Input
              id="settings-ws-url"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder="ws://localhost:13334"
            />
            <p className="text-xs text-muted mt-1">
              {t('wsUrlHelp', { default: 'ws://localhost:13334' })}
            </p>
          </div>
        </SectionCard>

        {/* Timezone Section */}
        <SectionCard
          className="rounded-md"
          title={t('timezoneTitle')}
          description={t('timezoneDesc')}
        >
          <div>
            <label htmlFor="settings-default-tz" className="text-xs text-muted block mb-1">
              {t('timezoneLabel')}
            </label>
            <Input
              id="settings-default-tz"
              value={defaultTz}
              onChange={(e) => setDefaultTz(e.target.value)}
              placeholder="UTC"
            />
            <p className="text-xs text-muted mt-1">{t('timezoneHelp')}</p>
          </div>
        </SectionCard>

        {/* AI Planning Section */}
        <SectionCard
          className="rounded-md"
          title={t('planningTitle')}
          description={t('planningDesc')}
        >
          <p className="text-xs text-muted">
            {t.rich('planningBody', {
              link: (chunks) => (
                <Link href="/settings/runtime" className="underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </SectionCard>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          {saveMessage && (
            <span role="status" className={`text-sm ${saveMessage.ok ? 'text-ok' : 'text-alert'}`}>
              {saveMessage.text}
            </span>
          )}
          <Link
            href="/settings"
            className="text-muted px-4 py-2 text-sm no-underline hover:text-foreground"
          >
            {tCommon('cancel')}
          </Link>
          <Button variant="primary" size="lg" onClick={handleSave} disabled={saving}>
            {saving ? tc('saving') : tc('saveChanges')}
          </Button>
        </div>
      </div>
    </div>
  )
}
