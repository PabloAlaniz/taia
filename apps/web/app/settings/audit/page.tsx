'use client'

import { useTranslations } from 'next-intl'
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

const DEFAULT_WORKSPACE_ID = 'ws-default'

export default function SettingsAuditPage() {
  const tp = useTranslations('pageTitles')
  const [workspaceId, setWorkspaceId] = useState(DEFAULT_WORKSPACE_ID)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [status, setStatus] = useState('Loading audit trail…')

  const load = useCallback(async () => {
    setStatus('Loading audit trail…')
    const res = await fetch(
      `/api/settings/audit?workspace_id=${encodeURIComponent(workspaceId)}&limit=50`,
    )
    const data = await res.json()
    if (!data.ok) {
      setStatus(data.error || 'Failed to load audit trail')
      setEvents([])
      return
    }
    setEvents(data.events || [])
    setStatus(`${data.total} audit events found`)
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
          <p className="text-sm text-muted">
            Workspace-aware diagnostic trail for Settings and API key mutations. Secret values are
            never stored here; sensitive keys are classified as API-key resources only by name.
          </p>
          <div className="flex gap-2">
            <Input
              aria-label="Workspace ID"
              className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm"
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            />
            <Button variant="primary" size="lg" onClick={load}>
              Refresh
            </Button>
          </div>
          <div className="text-sm text-muted">{status}</div>
        </Card>

        <Card padding="md" className="rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-border">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Key</th>
                <th className="py-2 pr-3">Resource</th>
                <th className="py-2 pr-3">Operation</th>
                <th className="py-2 pr-3">Actor</th>
                <th className="py-2 pr-3">Origin</th>
                <th className="py-2 pr-3">Result</th>
                <th className="py-2 pr-3">Message</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-border/60">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {new Date(event.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 font-mono">{event.setting_key}</td>
                  <td className="py-2 pr-3">{event.resource_type}</td>
                  <td className="py-2 pr-3">{event.operation}</td>
                  <td className="py-2 pr-3">{event.actor}</td>
                  <td className="py-2 pr-3">{event.origin}</td>
                  <td className="py-2 pr-3">{event.result}</td>
                  <td className="py-2 pr-3 text-muted">{event.message || '—'}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted">
                    No audit events for this workspace yet.
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
