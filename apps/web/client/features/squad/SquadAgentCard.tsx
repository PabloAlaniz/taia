'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, Pause, Pencil, Play, Power, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentContextEditor } from '../agent-context/AgentContextEditor'
import { IdentityEditor } from '../agent-context/IdentityEditor'
import { IdentityHistory } from '../agent-context/IdentityHistory'
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
  const tc = useTranslations('agentsConfig')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const [expanded, setExpanded] = useState(false)
  const [confirmCronDelete, setConfirmCronDelete] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [cronSchedule, setCronSchedule] = useState(
    member.cron?.scheduleRaw || member.cron?.schedule || '',
  )
  const [newCronSchedule, setNewCronSchedule] = useState('0 */6 * * *')
  const panelId = useId()
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [cronHistory, setCronHistory] = useState<
    Array<{ runId?: string; status?: string; startedAt?: string; durationMs?: number }>
  >([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)
  // Bumped after a restore so the editors reload the restored identity.
  const [editorKey, setEditorKey] = useState(0)
  // Bumped after a save so an open version list picks up the new version.
  const [versionsKey, setVersionsKey] = useState(0)

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
    }
  }

  // Opening the schedule loads its runs; they are part of the same answer.
  const toggleSchedule = () => {
    const next = !scheduleOpen
    setScheduleOpen(next)
    if (next && member.cron) void loadHistory()
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

  const ctx = member.context
  const contextParts = ctx
    ? [
        ctx.persona && t('ctx.persona'),
        ctx.instructions && t('ctx.instructions'),
        ctx.workingNotes && t('ctx.notes'),
        ctx.memoryFiles.length > 0 && t('ctx.memory', { count: ctx.memoryFiles.length }),
      ].filter((part): part is string => Boolean(part))
    : []
  const contextSummary = contextParts.length > 0 ? contextParts.join(' · ') : t('ctx.none')

  return (
    <Strip kind={isPerson ? 'person' : 'agent'} quiet={!member.enabled} className="p-0">
      {/* eslint-disable-next-line no-restricted-syntax -- the strip itself is the disclosure control */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        // The visible counts read as a run of numbers; the name says what they count.
        aria-label={t('rowLabel', {
          name: member.name,
          kind: isPerson ? t('kind.person') : t('kind.agent'),
          assigned: member.tasks.assigned,
          inProgress: member.tasks.inProgress,
          review: member.tasks.review,
        })}
        aria-describedby={`${panelId}-state`}
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
            {/* Role and state stay announced as the row's description. */}
            <span id={`${panelId}-state`} className="contents">
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
            </span>
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
        <div id={panelId} className="border-t border-border/70 pl-4 pr-3 py-3 space-y-3">
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
            {/* Ghost at rest: red only inside the confirmation. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(member.id)}
              className="flex items-center gap-1.5"
            >
              <Trash2 size={14} aria-hidden="true" />
              {t('deleteMember')}
            </Button>
          </div>

          {member.toolsDenied && member.toolsDenied.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-1.5 text-mid">
              <span className="text-muted">{t('deniedTools')}</span>
              {member.toolsDenied.map((tool) => (
                <code
                  key={tool}
                  className="font-mono text-xs px-1.5 py-0.5 rounded-sm text-foreground ring-1 ring-inset ring-border"
                >
                  {tool}
                </code>
              ))}
            </div>
          )}

          {!isPerson && (
            <div className="border-t border-border/70 pt-1">
              <Disclosure
                id={`${panelId}-schedule`}
                open={scheduleOpen}
                onToggle={toggleSchedule}
                label={t('scheduleSection')}
                summary={
                  member.cron ? (
                    <>
                      <code className="font-mono text-xs">{member.cron.schedule}</code>
                      {!member.cron.enabled && <> · {t('pausedShort')}</>}
                    </>
                  ) : (
                    t('noSchedule')
                  )
                }
              >
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
                      placeholder={t('cronPlaceholder')}
                      aria-describedby={`cron-${member.id}-help`}
                      className="w-52"
                    />
                    {member.cron ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={updateSchedule}
                        disabled={
                          cronSchedule === (member.cron.scheduleRaw || member.cron.schedule)
                        }
                      >
                        {t('save')}
                      </Button>
                    ) : (
                      <Button variant="primary" size="sm" onClick={createCron}>
                        {t('create')}
                      </Button>
                    )}
                  </div>
                  <p id={`cron-${member.id}-help`} className="text-xs text-muted">
                    {t('cronHelp')}
                  </p>
                </div>

                {member.cron && (
                  <div>
                    <h3 className="text-sm font-medium">
                      {t('runHistory')}
                      {historyLoading && <span className="text-muted"> …</span>}
                    </h3>
                    {cronHistory.length > 0 && (
                      <ol className="mt-1 max-h-48 overflow-y-auto divide-y divide-border/60 text-sm">
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
                    {cronHistory.length === 0 && !historyLoading && (
                      <p className="text-sm text-muted mt-1">{t('noRuns')}</p>
                    )}
                  </div>
                )}

                {member.cron && (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmCronDelete(true)}>
                    {t('deleteCron')}
                  </Button>
                )}
              </Disclosure>

              <Disclosure
                id={`${panelId}-context`}
                open={contextOpen}
                onToggle={() => setContextOpen((open) => !open)}
                label={t('contextSection')}
                summary={contextSummary}
              >
                <AgentContextEditor
                  key={editorKey}
                  agentId={member.id}
                  onSaved={() => setVersionsKey((k) => k + 1)}
                  extraTabs={[
                    {
                      key: 'identity',
                      label: tc('identityTab'),
                      content: (
                        <IdentityEditor
                          agentId={member.id}
                          onSaved={() => setVersionsKey((k) => k + 1)}
                        />
                      ),
                    },
                  ]}
                />

                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVersionsOpen((open) => !open)}
                    aria-expanded={versionsOpen}
                    aria-controls={`versions-${member.id}`}
                    className="flex items-center gap-1"
                  >
                    {versionsOpen ? (
                      <ChevronDown size={14} aria-hidden="true" />
                    ) : (
                      <ChevronRight size={14} aria-hidden="true" />
                    )}
                    {tc('openHistory')}
                  </Button>
                  {versionsOpen && (
                    <div id={`versions-${member.id}`}>
                      <IdentityHistory
                        key={versionsKey}
                        agentId={member.id}
                        onRestored={() => {
                          setMessage({ type: 'success', text: tc('history.restored') })
                          setTimeout(() => setMessage(null), 3000)
                          setEditorKey((k) => k + 1)
                        }}
                      />
                    </div>
                  )}
                </div>
              </Disclosure>
            </div>
          )}
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
        // State badges are rings, not fills: they read on strip and card alike.
        'text-xxs font-bold uppercase tracking-[0.1em] px-1.5 rounded-[2px] ring-1 ring-inset',
        tone === 'ok' && 'text-ok ring-ok/60',
        tone === 'muted' && 'text-muted ring-border',
        tone === 'alert' && 'text-alert ring-alert/60',
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

/**
 * A section of the expanded row, closed by default: a button that names the
 * section and a one-line summary of what is inside, so the row stays short.
 */
function Disclosure({
  id,
  open,
  onToggle,
  label,
  summary,
  children,
}: {
  id: string
  open: boolean
  onToggle: () => void
  label: string
  summary: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border/70 last:border-b-0">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="w-full flex items-baseline gap-2 px-1 py-2 text-left"
      >
        {open ? (
          <ChevronDown size={14} className="self-center shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight size={14} className="self-center shrink-0" aria-hidden="true" />
        )}
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-mid font-normal text-muted truncate min-w-0">{summary}</span>
      </Button>
      {open && (
        <div id={id} className="pl-6 pr-1 pt-1 pb-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}
