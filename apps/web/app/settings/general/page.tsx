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
  const [wsUrl, setWsUrl] = useState('ws://localhost:13334')
  const [defaultTz, setDefaultTz] = useState('UTC')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

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
    setSaveMessage('')
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
        setSaveMessage('Guardado')
        setTimeout(() => setSaveMessage(''), 3000)
      } else {
        setSaveMessage(`Error: ${data.error}`)
      }
    } catch (e) {
      setSaveMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
    setSaving(false)
  }

  const inputClass =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-hidden focus:border-accent'

  if (loading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <span className="text-muted text-sm">Cargando...</span>
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
          title="WebSocket"
          description="Conexion en tiempo real para actualizaciones del tablero."
        >
          <div>
            <label className="text-xs text-muted block mb-1">WebSocket URL</label>
            <Input
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder="ws://localhost:13334"
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">
              URL del servidor WebSocket. Por defecto: ws://localhost:13334
            </p>
          </div>
        </SectionCard>

        {/* Timezone Section */}
        <SectionCard
          title="Zona horaria"
          description="Zona horaria por defecto para cron jobs de agentes."
        >
          <div>
            <label className="text-xs text-muted block mb-1">Timezone</label>
            <Input
              value={defaultTz}
              onChange={(e) => setDefaultTz(e.target.value)}
              placeholder="UTC"
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">
              Formato IANA (ej: UTC, America/Argentina/Buenos_Aires, Europe/Madrid).
            </p>
          </div>
        </SectionCard>

        {/* AI Planning Section */}
        <SectionCard
          title="Planificación IA"
          description="El asistente de planificación descompone objetivos en tareas."
        >
          <p className="text-xs text-muted">
            Usa el runtime activo, que tiene que soportar sesiones (OpenClaw, Claude por API, Claude
            Code o Aider). Configuralo en{' '}
            <Link href="/settings/runtime" className="underline">
              Ajustes › Runtime
            </Link>
            .
          </p>
        </SectionCard>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          {saveMessage && (
            <span
              className={`text-sm ${saveMessage.startsWith('Error') ? 'text-red-500' : 'text-green-500'}`}
            >
              {saveMessage}
            </span>
          )}
          <Link
            href="/settings"
            className="text-muted px-4 py-2 text-sm no-underline hover:text-foreground"
          >
            Cancelar
          </Link>
          <Button variant="primary" size="lg" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
