'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, Pause, Pencil, Play, Power, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentContextEditor } from '../agent-context/AgentContextEditor'
import { Alert, Button, Input, Strip } from '@/components/atoms'
import { ConfirmDialog } from '@/components/molecules'
import type { SquadMember } from './types'

export function SquadAgentCard({
  member,
  onUpdate,
  onEdit,
  onDelete,
}: {
  member: SquadMember
  onUpdate: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}) {
  const t = useTranslations('squad')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const [expanded, setExpanded] = useState(false)
  const [confirmCronDelete, setConfirmCronDelete] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [cronSchedule, setCronSchedule] = useState(
    member.cron?.scheduleRaw || member.cron?.schedule || '',
  )
  const [newCronSchedule, setNewCronSchedule] = useState('0 */6 * * *')
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [cronHistory, setCronHistory] = useState<
    Array<{ runId?: string; status?: string; startedAt?: string; durationMs?: number }>
  >([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const toggleCron = async () => {
    try {
      const res = await fetch(`/api/agents/${member.id}/cron`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !member.cron?.enabled }),
      })
      if (res.ok) {
        setMessage({
          type: 'success',
          text: !member.cron?.enabled ? t('msg.cronEnabled') : t('msg.cronPaused'),
        })
        setTimeout(() => setMessage(null), 3000)
        onUpdate()
      }
    } catch {
      setMessage({ type: 'error', text: t('msg.cronToggleFailed') })
    }
  }

  const toggleEnabled = async () => {
    try {
      const res = await fetch(`/api/agents/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: member.enabled ? 0 : 1 }),
      })
      if (res.ok) {
        setMessage({
          type: 'success',
          text: !member.enabled ? t('msg.enabled') : t('msg.disabled'),
        })
        setTimeout(() => setMessage(null), 3000)
        onUpdate()
      }
    } catch {
      setMessage({ type: 'error', text: t('msg.toggleFailed') })
    }
  }

  const updateSchedule = async () => {
    try {
      const res = await fetch(`/api/agents/${member.id}/cron`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: cronSchedule }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: t('msg.scheduleUpdated') })
        setTimeout(() => setMessage(null), 3000)
        onUpdate()
      }
    } catch {
      setMessage({ type: 'error', text: t('msg.scheduleFailed') })
    }
  }

  const triggerRun = async () => {
    try {
      const res = await fetch(`/api/agents/${member.id}/cron/run`, { method: 'POST' })
      if (res.ok) {
        setMessage({ type: 'success', text: t('msg.runStarted') })
        setTimeout(() => setMessage(null), 3000)
        onUpdate()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || t('msg.runFailed') })
      }
    } catch {
      setMessage({ type: 'error', text: t('msg.runFailed') })
    }
  }

  const deleteCron = async () => {
    setConfirmCronDelete(false)
    try {
      const res = await fetch(`/api/agents/${member.id}/cron`, { method: 'DELETE' })
      if (res.ok) {
        setMessage({ type: 'success', text: t('msg.cronDeleted') })
        setTimeout(() => setMessage(null), 3000)
        onUpdate()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || t('msg.cronDeleteFailed') })
      }
    } catch {
      setMessage({ type: 'error', text: t('msg.cronDeleteFailed') })
    }
  }

  const createCron = async () => {
    try {
      const res = await fetch(`/api/agents/${member.id}/cron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: newCronSchedule }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: t('msg.cronCreated') })
        setTimeout(() => setMessage(null), 3000)
        onUpdate()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || t('msg.cronCreateFailed') })
      }
    } catch {
      setMessage({ type: 'error', text: t('msg.cronCreateFailed') })
    }
  }

  const loadHistory = async () => {
    if (historyExpanded) {
      setHistoryExpanded(false)
      return
    }
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/agents/${member.id}/cron/history`)
      if (res.ok) {
        const data = await res.json()
        setCronHistory(data.runs || [])
      }
    } catch {
      setCronHistory([])
    } finally {
      setHistoryLoading(false)
      setHistoryExpanded(true)
    }
  }

  const totalTasks = member.tasks.assigned + member.tasks.inProgress + member.tasks.review

  const isPerson = member.type === 'human'
  const lastStatusClass =
    member.cron?.lastStatus === 'ok'
      ? 'text-ok'
      : member.cron?.lastStatus === 'error'
        ? 'text-alert'
        : 'text-muted'
  const rel = (iso: string) => format.relativeTime(new Date(iso), now)

  return (
    <Strip kind={isPerson ? 'person' : 'agent'} quiet={!member.enabled} className="p-0">
      {/* eslint-disable-next-line no-restricted-syntax -- the strip itself is the disclosure control */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 pl-4 pr-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent rounded-[2px]"
      >
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
            <span
              className={cn(
                'font-semibold text-base truncate',
                isPerson ? 'text-person-ink' : 'text-agent-ink',
              )}
            >
              {member.name}
            </span>
            {member.role && !(isPerson && member.role === 'Agent') && (
              <span className="text-sm text-muted truncate">{member.role}</span>
            )}
            {!member.enabled && <StateChip tone="muted">{t('disabled')}</StateChip>}
            {member.enabled && member.cron && (
              <StateChip tone={member.cron.enabled ? 'ok' : 'muted'}>
                {member.cron.enabled ? t('cronOn') : t('cronPaused')}
              </StateChip>
            )}
            {member.cron?.lastError && <StateChip tone="alert">{t('lastRunFailed')}</StateChip>}
          </div>
          <div className="flex items-baseline gap-2 mt-0.5 text-mid text-muted min-w-0 flex-wrap">
            {member.model && (
              <code className="font-mono text-xs">{member.model.split('/').pop()}</code>
            )}
            {member.cron && (
              <span>
                {t('schedule')} <code className="font-mono text-xs">{member.cron.schedule}</code>
              </span>
            )}
            {member.cron?.lastRun && (
              <span>
                {t('lastRun')} <span className={lastStatusClass}>{rel(member.cron.lastRun)}</span>
              </span>
            )}
            {member.cron?.nextRun && member.cron.enabled && (
              <span>
                {t('nextRun')} {rel(member.cron.nextRun)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-mid tabular-nums whitespace-nowrap">
          <TaskCount n={member.tasks.assigned} label={t('assigned')} />
          <TaskCount n={member.tasks.inProgress} label={t('inProgress')} strong />
          <TaskCount n={member.tasks.review} label={t('inReview')} />
          {expanded ? (
            <ChevronDown size={16} className="text-muted" aria-hidden="true" />
          ) : (
            <ChevronRight size={16} className="text-muted" aria-hidden="true" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/70 pl-4 pr-3 py-4 space-y-4">
          {message && (
            <Alert variant={message.type === 'success' ? 'success' : 'error'}>{message.text}</Alert>
          )}
          {member.cron?.lastError && (
            <Alert
              variant="error"
              className="font-mono text-mid whitespace-pre-wrap wrap-break-word"
            >
              {member.cron.lastError}
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleEnabled}
              className="flex items-center gap-1.5"
            >
              <Power size={14} aria-hidden="true" />
              {member.enabled ? t('disable') : t('enable')}
            </Button>
            {member.cron && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleCron}
                  className="flex items-center gap-1.5"
                >
                  {member.cron.enabled ? (
                    <Pause size={14} aria-hidden="true" />
                  ) : (
                    <Play size={14} aria-hidden="true" />
                  )}
                  {member.cron.enabled ? t('pauseCron') : t('resumeCron')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={triggerRun}
                  className="flex items-center gap-1.5"
                >
                  <Play size={14} aria-hidden="true" />
                  {t('runNow')}
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onEdit(member.id)}
              className="flex items-center gap-1.5"
            >
              <Pencil size={14} aria-hidden="true" />
              {t('edit')}
            </Button>
            <Link
              href={`/?assigned_to=${member.id}`}
              className="rounded border border-border bg-card px-2.5 py-1 text-xs font-semibold no-underline text-foreground hover:bg-strip"
            >
              {t('viewTasks', { count: totalTasks })}
            </Link>
            <span className="flex-1" />
            {member.cron && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmCronDelete(true)}>
                {t('deleteCron')}
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              onClick={() => onDelete(member.id)}
              className="flex items-center gap-1.5"
            >
              <Trash2 size={14} aria-hidden="true" />
              {isPerson ? t('removePerson') : t('deleteAgent')}
            </Button>
          </div>

          {!isPerson && (
            <div className="grid gap-1.5 max-w-md">
              <label htmlFor={`cron-${member.id}`} className="text-sm font-medium">
                {member.cron ? t('scheduleLabel') : t('createSchedule')}
              </label>
              <div className="flex gap-2">
                <Input
                  id={`cron-${member.id}`}
                  type="text"
                  variant="mono"
                  value={member.cron ? cronSchedule : newCronSchedule}
                  onChange={(e) =>
                    member.cron
                      ? setCronSchedule(e.target.value)
                      : setNewCronSchedule(e.target.value)
                  }
                  placeholder="0 */6 * * *"
                  className="w-52"
                />
                {member.cron ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={updateSchedule}
                    disabled={cronSchedule === (member.cron.scheduleRaw || member.cron.schedule)}
                  >
                    {t('save')}
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={createCron}>
                    {t('create')}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted">{t('cronHelp')}</p>
            </div>
          )}

          {member.cron && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadHistory}
                aria-expanded={historyExpanded}
                className="flex items-center gap-1"
              >
                {historyExpanded ? (
                  <ChevronDown size={14} aria-hidden="true" />
                ) : (
                  <ChevronRight size={14} aria-hidden="true" />
                )}
                {t('runHistory')}
                {historyLoading && <span className="text-muted">…</span>}
              </Button>
              {historyExpanded && cronHistory.length > 0 && (
                <ol className="mt-2 max-h-48 overflow-y-auto divide-y divide-border/60 text-sm">
                  {cronHistory.map((run, i) => (
                    <li
                      key={run.runId || i}
                      className="flex justify-between gap-4 py-1.5 tabular-nums"
                    >
                      <span
                        className={
                          run.status === 'ok'
                            ? 'text-ok'
                            : run.status === 'error'
                              ? 'text-alert'
                              : 'text-muted'
                        }
                      >
                        {run.status
                          ? t(
                              `runStatus.${run.status === 'ok' || run.status === 'error' ? run.status : 'other'}`,
                            )
                          : '—'}
                      </span>
                      <span className="text-muted">
                        {run.startedAt ? rel(run.startedAt) : ''}
                        {run.durationMs ? ` · ${(run.durationMs / 1000).toFixed(1)} s` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {historyExpanded && cronHistory.length === 0 && !historyLoading && (
                <p className="text-sm text-muted mt-1">{t('noRuns')}</p>
              )}
            </div>
          )}

          {member.toolsDenied && member.toolsDenied.length > 0 && (
            <div>
              <p className="text-sm font-medium">{t('deniedTools')}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {member.toolsDenied.map((tool) => (
                  <code
                    key={tool}
                    className="text-xs px-1.5 py-0.5 rounded-sm bg-alert/10 text-alert font-mono"
                  >
                    {tool}
                  </code>
                ))}
              </div>
            </div>
          )}

          {!isPerson && <AgentContextEditor agentId={member.id} />}
        </div>
      )}

      <ConfirmDialog
        open={confirmCronDelete}
        title={t('confirmCronDelete.title', { name: member.name })}
        body={t('confirmCronDelete.body')}
        confirmLabel={t('confirmCronDelete.action')}
        cancelLabel={t('cancel')}
        destructive
        onConfirm={deleteCron}
        onCancel={() => setConfirmCronDelete(false)}
      />
    </Strip>
  )
}

function StateChip({
  tone,
  children,
}: {
  tone: 'ok' | 'muted' | 'alert'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'text-xxs font-bold uppercase tracking-[0.1em] px-1.5 rounded-[2px]',
        tone === 'ok' && 'bg-ok/15 text-ok',
        tone === 'muted' && 'bg-border/60 text-muted',
        tone === 'alert' && 'bg-alert/15 text-alert',
      )}
    >
      {children}
    </span>
  )
}

function TaskCount({ n, label, strong }: { n: number; label: string; strong?: boolean }) {
  return (
    <span className="flex flex-col items-end leading-tight">
      <span
        className={cn(
          'text-base',
          strong && n > 0
            ? 'font-semibold text-agent-ink'
            : n === 0
              ? 'font-medium text-muted'
              : 'font-medium',
        )}
      >
        {n}
      </span>
      <span className="text-xxs uppercase tracking-[0.08em] text-muted">{label}</span>
    </span>
  )
}
