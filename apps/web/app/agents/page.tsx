'use client'

import { useState } from 'react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { getDefaultAvatar } from '@taia/core/agents/metadata'
import { Alert, Button, Input } from '@/components/atoms'
import { EmptyState } from '@/components/molecules/empty-state'
import { PageHeader } from '@/components/molecules/page-header'
import { IdentityEditor } from './_components/identity-editor'
import { AgentContextEditor } from '@/client/features/agent-context/AgentContextEditor'
import { fetchJson, useResource } from '@/lib/use-resource'

interface AgentConfig {
  id: string
  name: string
  model: string
  heartbeat: {
    schedule: string
    timeoutSeconds: number
    nextRunAt?: string
  }
  tools: {
    denied: string[]
  }
  personaSummary?: string
  workingStatus?: string
}

interface CronStatus {
  enabled: boolean
  schedule: string
  nextRun: string | null
  lastRun: string | null
  lastStatus: string
}

interface IdentityVersionEntry {
  versionId: string
  content: {
    persona?: string
    instructions?: string
    role?: string
    name?: string
  }
  createdAt: string
  createdBy: string | null
  note: string | null
}

function VersionHistoryDrawer({
  agentId,
  isOpen,
  onClose,
  onRestored,
}: {
  agentId: string
  isOpen: boolean
  onClose: () => void
  onRestored: () => void
}) {
  const t = useTranslations('agentsConfig.history')
  const tc = useTranslations('agentContext.sections')
  const format = useFormatter()
  const versionsUrl = `/api/agents/${agentId}/context/versions`
  const history = useResource(isOpen ? versionsUrl : null, () =>
    fetchJson<{ versions?: IdentityVersionEntry[] }>(versionsUrl),
  )
  const versions = history.data ? (history.data.versions ?? []) : null
  const [restoring, setRestoring] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const error = restoreError
    ? t('restoreFailed', { error: restoreError })
    : history.error
      ? t('loadFailed', { error: history.error })
      : null

  const close = () => {
    setRestoreError(null)
    onClose()
  }

  const restore = async (versionId: string) => {
    setRestoring(versionId)
    setRestoreError(null)
    try {
      const res = await fetch(`/api/agents/${agentId}/context/versions/${versionId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      onRestored()
      close()
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err))
    } finally {
      setRestoring(null)
    }
  }

  if (!isOpen) return null
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border-l border-border h-full w-full max-w-[480px] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold">{t('title')}</h3>
          <Button variant="ghost" size="sm" onClick={close} aria-label={t('close')}>
            <X size={16} aria-hidden="true" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && <Alert variant="error">{error}</Alert>}

          {!versions && !error && <div className="text-muted text-mid">{t('loading')}</div>}

          {versions && versions.length === 0 && (
            <div className="text-muted text-mid">{t('empty')}</div>
          )}

          {versions?.map((v, i) => {
            const isOpen = expanded === v.versionId
            const personaPreview = (v.content.persona ?? '').slice(0, 200)
            const instructionsPreview = (v.content.instructions ?? '').slice(0, 200)
            const date = format.dateTime(new Date(v.createdAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
            return (
              <div key={v.versionId} className="border border-border rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-mid">
                    <div className="font-medium">{i === 0 ? t('current', { date }) : date}</div>
                    <div className="text-muted text-sm">
                      {v.createdBy ?? t('unknownAuthor')}
                      {v.note ? ` · ${v.note}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(isOpen ? null : v.versionId)}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? t('hide') : t('preview')}
                    </Button>
                    {i > 0 && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => restore(v.versionId)}
                        disabled={restoring !== null}
                      >
                        {restoring === v.versionId ? t('restoring') : t('restore')}
                      </Button>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-3 space-y-3 text-sm">
                    <div>
                      <div className="text-muted text-xs mb-1">{tc('persona')}</div>
                      <pre className="bg-background rounded p-2 whitespace-pre-wrap text-xs">
                        {personaPreview || t('emptyField')}
                        {(v.content.persona ?? '').length > 200 ? '…' : ''}
                      </pre>
                    </div>
                    <div>
                      <div className="text-muted text-xs mb-1">{tc('instructions')}</div>
                      <pre className="bg-background rounded p-2 whitespace-pre-wrap text-xs">
                        {instructionsPreview || t('emptyField')}
                        {(v.content.instructions ?? '').length > 200 ? '…' : ''}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AgentCard({ agent, onRefresh }: { agent: AgentConfig; onRefresh: () => void }) {
  const t = useTranslations('agentsConfig')
  const ts = useTranslations('squad')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const [expanded, setExpanded] = useState(false)
  // The cron is loaded the first time the card is expanded.
  const [cronRequested, setCronRequested] = useState(false)
  const cronUrl = `/api/agents/${agent.id}/cron`
  const { data: cron, reload: reloadCron } = useResource(cronRequested ? cronUrl : null, () =>
    fetchJson<CronStatus>(cronUrl),
  )
  // `null` while the input shows the stored schedule.
  const [scheduleDraft, setScheduleDraft] = useState<string | null>(null)
  const cronSchedule = scheduleDraft ?? cron?.schedule ?? ''
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const [historyKey, setHistoryKey] = useState(0)

  const toggleCron = async () => {
    if (!cron) return
    try {
      const res = await fetch(cronUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !cron.enabled }),
      })
      if (res.ok) {
        reloadCron()
        setMessage({
          type: 'success',
          text: !cron.enabled ? ts('msg.cronEnabled') : ts('msg.cronPaused'),
        })
        setTimeout(() => setMessage(null), 3000)
        onRefresh()
      } else {
        setMessage({ type: 'error', text: ts('msg.cronToggleFailed') })
      }
    } catch {
      setMessage({ type: 'error', text: ts('msg.cronToggleFailed') })
    }
  }

  const updateSchedule = async () => {
    try {
      const res = await fetch(cronUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: cronSchedule }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: ts('msg.scheduleUpdated') })
        setScheduleDraft(null)
        reloadCron()
        setTimeout(() => setMessage(null), 3000)
        onRefresh()
      } else {
        setMessage({ type: 'error', text: ts('msg.scheduleFailed') })
      }
    } catch {
      setMessage({ type: 'error', text: ts('msg.scheduleFailed') })
    }
  }

  return (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Header - Always visible */}
      {/* eslint-disable-next-line no-restricted-syntax -- expandable header with custom layout, not a primary action button */}
      <button
        type="button"
        onClick={() => {
          setExpanded(!expanded)
          setCronRequested(true)
        }}
        aria-expanded={expanded}
        style={{
          padding: '16px 20px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          width: '100%',
          background: 'none',
          border: 'none',
          color: 'inherit',
          font: 'inherit',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>{getDefaultAvatar(agent.id)}</span>
          <div>
            <h2 style={{ fontSize: '18px', margin: 0 }}>{agent.name}</h2>
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>
              {agent.heartbeat.schedule} • {agent.model.replace('anthropic/', '')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {cron && (
            <span
              className={
                cron.enabled
                  ? 'bg-ok/15 text-ok rounded-xl px-2.5 py-1 text-xs font-medium'
                  : 'bg-background text-muted rounded-xl px-2.5 py-1 text-xs font-medium'
              }
            >
              {cron.enabled ? t('cronActive') : t('cronPaused')}
            </span>
          )}
          {expanded ? (
            <ChevronDown size={20} className="text-muted" aria-hidden="true" />
          ) : (
            <ChevronRight size={20} className="text-muted" aria-hidden="true" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="p-5">
          {/* Message */}
          {message && (
            <Alert variant={message.type === 'success' ? 'success' : 'error'} className="mb-4">
              {message.text}
            </Alert>
          )}

          {/* Cron Controls */}
          <div className="flex gap-3 mb-5 items-center flex-wrap">
            <Button
              variant={cron?.enabled ? 'secondary' : 'primary'}
              size="lg"
              onClick={toggleCron}
            >
              {cron?.enabled ? ts('pauseCron') : ts('resumeCron')}
            </Button>

            <div className="flex gap-2 items-center">
              <Input
                type="text"
                variant="mono"
                value={cronSchedule}
                onChange={(e) => setScheduleDraft(e.target.value)}
                aria-label={t('scheduleLabel')}
                placeholder="0,15,30,45 * * * *"
                className="w-[200px]"
              />
              <Button
                variant={cronSchedule !== cron?.schedule ? 'primary' : 'secondary'}
                size="lg"
                onClick={updateSchedule}
                disabled={cronSchedule === cron?.schedule}
              >
                {t('saveSchedule')}
              </Button>
            </div>

            {cron?.nextRun && (
              <span className="text-muted text-mid">
                {t('nextRun', {
                  when: format.relativeTime(new Date(cron.nextRun), now),
                })}
              </span>
            )}
          </div>

          {/* Identity (structured) + prose context: persona, instructions,
              working notes and memory. Runtimes render them their own way. */}
          <AgentContextEditor
            key={historyKey}
            agentId={agent.id}
            extraTabs={[
              {
                key: 'identity',
                label: t('identityTab'),
                content: <IdentityEditor key={agent.id} agentId={agent.id} />,
              },
            ]}
          />

          <div className="mt-3 flex justify-end">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setHistoryOpen(true)}
              className="px-5"
            >
              {t('openHistory')}
            </Button>
          </div>
        </div>
      )}

      <VersionHistoryDrawer
        agentId={agent.id}
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={() => {
          setMessage({ type: 'success', text: t('history.restored') })
          setTimeout(() => setMessage(null), 3000)
          // Remount the editor so it reloads the restored identity.
          setHistoryKey((k) => k + 1)
        }}
      />
    </div>
  )
}

export default function AgentsPage() {
  const t = useTranslations('agents')
  const tg = useTranslations('agentsConfig')
  const tc = useTranslations('agentContext.sections')
  const {
    data,
    loading,
    error,
    reload: reloadAgents,
  } = useResource('/api/agents/config', () =>
    fetchJson<{ agents?: AgentConfig[] }>('/api/agents/config'),
  )
  const agents = data?.agents ?? []

  return (
    <div className="min-h-full bg-background">
      <PageHeader title={t('config')} />
      <div className="px-4 md:px-6 pt-5 pb-10 max-w-[1000px] mx-auto space-y-4">
        {loading ? (
          <div className="text-muted p-10 text-center">{t('loadingAgents')}</div>
        ) : error && !data ? (
          <Alert variant="error">{tg('loadFailed')}</Alert>
        ) : agents.length === 0 ? (
          <EmptyState title={tg('noAgents')} description={tg('noAgentsHint')} />
        ) : (
          <div className="flex flex-col gap-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onRefresh={reloadAgents} />
            ))}
          </div>
        )}

        {/* Help */}
        <div className="mt-8 p-4 bg-card rounded-lg border border-border">
          <h3 className="text-sm mb-3 text-muted">{t('quickGuide')}</h3>
          <div className="text-mid text-muted leading-loose">
            <div>
              <strong>{tc('persona')}</strong>: {tg('guide.persona')}
            </div>
            <div>
              <strong>{tc('instructions')}</strong>: {tg('guide.instructions')}
            </div>
            <div>
              <strong>{tg('guide.schedule')}</strong>:{' '}
              {tg('guide.scheduleDesc', { example: '0,15,30,45 * * * *' })}
            </div>
            <div>{tg('guide.changes')}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
