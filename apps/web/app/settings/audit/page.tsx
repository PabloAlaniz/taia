'use client'

import { useFormatter, useNow, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { Alert, Button, Select, Strip } from '@/components/atoms'
import { EmptyState } from '@/components/molecules/empty-state'
import { PageHeader } from '@/components/molecules/page-header'
import { RackSection } from '@/components/molecules/rack-section'
import { useStore } from '@/lib/store'

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

export default function SettingsAuditPage() {
  const tp = useTranslations('pageTitles')
  const t = useTranslations('settingsAudit')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const [workspaceId, setWorkspaceId] = useState(DEFAULT_WORKSPACE_ID)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [status, setStatus] = useState<LoadStatus>({ kind: 'loading' })
  const workspaces = useStore((s) => s.workspaces)
  const fetchWorkspaces = useStore((s) => s.fetchWorkspaces)

  useEffect(() => {
    if (workspaces.length === 0) void fetchWorkspaces()
  }, [workspaces.length, fetchWorkspaces])

  // The chosen id stays an option even before (or without) the list loading.
  const workspaceOptions = useMemo(
    () =>
      workspaces.some((w) => w.id === workspaceId)
        ? workspaces
        : [{ id: workspaceId, name: workspaceId }, ...workspaces],
    [workspaces, workspaceId],
  )

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
      <PageHeader
        width="data"
        title={tp('audit')}
        backHref="/settings"
        backLabel={tp('settings')}
      />
      <div className="px-4 md:px-6 pt-5 pb-10 max-w-6xl mx-auto space-y-4">
        <p className="text-sm text-muted max-w-prose">{t('intro')}</p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 max-w-sm">
            <label htmlFor="audit-workspace" className="text-xs text-muted block mb-1">
              {t('workspaceSelectLabel')}
            </label>
            <Select
              id="audit-workspace"
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            >
              {workspaceOptions.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="secondary" size="lg" onClick={load}>
            {t('refresh')}
          </Button>
        </div>

        {status.kind === 'error' && (
          <Alert variant="error">
            <p>{t('loadFailed')}</p>
            {status.detail && (
              <p className="text-xs text-muted font-normal font-mono mt-1">{status.detail}</p>
            )}
          </Alert>
        )}

        <RackSection
          id="settings-audit"
          title={t('rackTitle')}
          aside={
            <span role="status">
              {status.kind === 'loading' && t('loading')}
              {status.kind === 'loaded' && t('count', { count: status.total })}
            </span>
          }
        >
          {events.length === 0 && status.kind === 'loaded' && (
            <EmptyState
              onRack
              className="py-4 px-0"
              icon={<ScrollText size={20} aria-hidden="true" />}
              title={t('empty')}
            />
          )}
          {events.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {events.map((event) => {
                const createdAt = new Date(event.created_at)
                return (
                  <li key={event.id}>
                    <Strip className="py-2">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <span className="font-mono text-xs text-foreground break-all">
                          <span className="sr-only">{t('columns.key')}: </span>
                          {event.setting_key}
                        </span>
                        <span className="text-sm font-semibold">
                          <span className="sr-only">{t('columns.operation')}: </span>
                          {event.operation}
                        </span>
                        <span
                          className={
                            event.result === 'failure'
                              ? 'text-sm font-semibold text-alert'
                              : 'text-sm text-muted'
                          }
                        >
                          <span className="sr-only">{t('columns.result')}: </span>
                          {event.result}
                        </span>
                        <span className="ml-auto text-mid text-muted whitespace-nowrap">
                          <span className="sr-only">{t('columns.time')}: </span>
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
                        </span>
                      </div>
                      <div className="text-mid text-muted">
                        <span className="sr-only">{t('columns.actor')}: </span>
                        <span className="text-foreground">{event.actor}</span>
                        {' · '}
                        <span className="sr-only">{t('columns.origin')}: </span>
                        {event.origin}
                        {' · '}
                        <span className="sr-only">{t('columns.resource')}: </span>
                        {event.resource_type}
                      </div>
                      {event.message && (
                        <p className="text-mid text-muted mt-0.5">
                          <span className="sr-only">{t('columns.message')}: </span>
                          {event.message}
                        </p>
                      )}
                    </Strip>
                  </li>
                )
              })}
            </ul>
          )}
        </RackSection>
      </div>
    </div>
  )
}
