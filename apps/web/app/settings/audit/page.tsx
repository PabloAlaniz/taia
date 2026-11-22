'use client'

import { useFormatter, useNow, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/atoms/button'
import { Input } from '@/components/atoms/input'
import { PageHeader } from '@/components/molecules/page-header'
import { Card } from '@/components/molecules/card'

type AuditEvent = {
  id: string
  workspace_id: string
  setting_key: string
  resource_type: string
  operation: string
  actor: string
  origin: string
  result: string
  message: string | null
  created_at: string
}

type LoadStatus =
  | { kind: 'loading' }
  | { kind: 'error'; detail: string | null }
  | { kind: 'loaded'; total: number }

const DEFAULT_WORKSPACE_ID = 'ws-default'

const COLUMNS = [
  'time',
  'key',
  'resource',
  'operation',
  'actor',
  'origin',
  'result',
  'message',
] as const

export default function SettingsAuditPage() {
  const tp = useTranslations('pageTitles')
  const t = useTranslations('settingsAudit')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const [workspaceId, setWorkspaceId] = useState(DEFAULT_WORKSPACE_ID)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [status, setStatus] = useState<LoadStatus>({ kind: 'loading' })

  const load = useCallback(async () => {
    setStatus({ kind: 'loading' })
    try {
      const res = await fetch(
        `/api/settings/audit?workspace_id=${encodeURIComponent(workspaceId)}&limit=50`,
      )
      const data = await res.json()
      if (!data.ok) {
        setStatus({ kind: 'error', detail: data.error || null })
        setEvents([])
        return
      }
      setEvents(data.events || [])
      setStatus({ kind: 'loaded', total: data.total ?? 0 })
    } catch (e) {
      setStatus({ kind: 'error', detail: e instanceof Error ? e.message : String(e) })
      setEvents([])
    }
  }, [workspaceId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return (
    <div className="min-h-full bg-background">
      <PageHeader title={tp('audit')} backHref="/settings" backLabel={tp('settings')} />
      <div className="px-4 md:px-6 pt-5 pb-10 max-w-5xl mx-auto space-y-4">
        <Card padding="md" className="rounded-lg space-y-3">
          <p className="text-sm text-muted">{t('intro')}</p>
          <div className="flex gap-2">
            <Input
              aria-label={t('workspaceLabel')}
              className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm"
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            />
            <Button variant="primary" size="lg" onClick={load}>
              {t('refresh')}
            </Button>
          </div>
          <div role="status" className="text-sm">
            {status.kind === 'loading' && <span className="text-muted">{t('loading')}</span>}
            {status.kind === 'loaded' && (
              <span className="text-muted">{t('count', { count: status.total })}</span>
            )}
            {status.kind === 'error' && (
              <>
                <span className="text-alert">{t('loadFailed')}</span>
                {status.detail && (
                  <span className="block text-xs text-muted font-mono mt-1">{status.detail}</span>
                )}
              </>
            )}
          </div>
        </Card>

        <Card padding="md" className="rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-border">
                {COLUMNS.map((column) => (
                  <th key={column} className="py-2 pr-3">
                    {t(`columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const createdAt = new Date(event.created_at)
                return (
                  <tr key={event.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <time
                        dateTime={event.created_at}
                        title={format.dateTime(createdAt, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      >
                        {format.relativeTime(
                          new Date(Math.min(createdAt.getTime(), now.getTime())),
                          now,
                        )}
                      </time>
                    </td>
                    <td className="py-2 pr-3 font-mono">{event.setting_key}</td>
                    <td className="py-2 pr-3">{event.resource_type}</td>
                    <td className="py-2 pr-3">{event.operation}</td>
                    <td className="py-2 pr-3">{event.actor}</td>
                    <td className="py-2 pr-3">{event.origin}</td>
                    <td className="py-2 pr-3">{event.result}</td>
                    <td className="py-2 pr-3 text-muted">{event.message || '—'}</td>
                  </tr>
                )
              })}
              {events.length === 0 && status.kind === 'loaded' && (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-8 text-center text-muted">
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
