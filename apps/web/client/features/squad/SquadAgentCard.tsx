'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatRelativeTime, timeUntil } from '@/lib/utils'
import { AgentContextEditor } from '../agent-context/AgentContextEditor'
import { Alert, Button, Input } from '@/components/atoms'
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
  const [expanded, setExpanded] = useState(false)
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
          text: `Heartbeat ${!member.cron?.enabled ? 'enabled' : 'disabled'}`,
        })
        setTimeout(() => setMessage(null), 3000)
        onUpdate()
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to toggle cron' })
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
        setMessage({ type: 'success', text: `Agent ${!member.enabled ? 'enabled' : 'disabled'}` })
        setTimeout(() => setMessage(null), 3000)
        onUpdate()
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to toggle agent' })
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
        setMessage({ type: 'success', text: 'Schedule updated!' })
        setTimeout(() => setMessage(null), 3000)
        onUpdate()
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update schedule' })
    }
  }

  const triggerRun = async () => {
    try {
      const res = await fetch(`/api/agents/${member.id}/cron/run`, { method: 'POST' })
      if (res.ok) {
        setMessage({ type: 'success', text: 'Cron run triggered!' })
        setTimeout(() => setMessage(null), 3000)
        onUpdate()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to trigger run' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to trigger cron run' })
    }
  }

  const deleteCron = async () => {
    if (!confirm(`Delete cron job for ${member.name}?`)) return
    try {
      const res = await fetch(`/api/agents/${member.id}/cron`, { method: 'DELETE' })
      if (res.ok) {
        setMessage({ type: 'success', text: 'Cron deleted' })
        setTimeout(() => setMessage(null), 3000)
        onUpdate()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to delete cron' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete cron' })
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
        setMessage({ type: 'success', text: 'Cron created!' })
        setTimeout(() => setMessage(null), 3000)
        onUpdate()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to create cron' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to create cron' })
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

  const statusColor =
    member.cron?.lastStatus === 'ok'
      ? '#22c55e'
      : member.cron?.lastStatus === 'error'
        ? '#ef4444'
        : '#6b7280'

  return (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        opacity: member.enabled ? 1 : 0.6,
      }}
    >
      {/* Header */}
      {/* eslint-disable-next-line no-restricted-syntax -- expandable card header with custom layout, not a primary action button */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '28px' }}>{member.avatar}</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', margin: 0, fontWeight: 600 }}>{member.name}</h2>
              {!member.enabled && (
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: '#6b728022',
                    color: '#6b7280',
                    fontWeight: 500,
                  }}
                >
                  DISABLED
                </span>
              )}
              {member.enabled && member.cron && (
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: member.cron?.enabled ? '#22c55e22' : '#6b728022',
                    color: member.cron?.enabled ? '#22c55e' : '#6b7280',
                    fontWeight: 500,
                  }}
                >
                  {member.cron?.enabled ? '● ACTIVE' : '○ PAUSED'}
                </span>
              )}
              {member.cron?.lastError && (
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: '#ef444422',
                    color: '#ef4444',
                  }}
                >
                  ⚠️ ERROR
                </span>
              )}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
              {member.role}
              {member.model && (
                <>
                  {' '}
                  •{' '}
                  <code
                    style={{
                      fontSize: '11px',
                      background: 'var(--background)',
                      padding: '1px 4px',
                      borderRadius: '3px',
                    }}
                  >
                    {member.model.split('/').pop()}
                  </code>
                </>
              )}
              {member.cron && <> • {member.cron.schedule}</>}
              {member.cron?.lastRun && (
                <>
                  {' '}
                  • Last:{' '}
                  <span style={{ color: statusColor }}>
                    {formatRelativeTime(member.cron.lastRun)}
                  </span>
                </>
              )}
              {member.cron?.nextRun && member.cron.enabled && (
                <> • Next: {timeUntil(member.cron.nextRun)}</>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {totalTasks > 0 && (
            <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--muted)' }}>
              {member.tasks.assigned > 0 && <span>📋 {member.tasks.assigned}</span>}
              {member.tasks.inProgress > 0 && <span>🔄 {member.tasks.inProgress}</span>}
              {member.tasks.review > 0 && <span>👀 {member.tasks.review}</span>}
            </div>
          )}
          <span style={{ color: 'var(--muted)', fontSize: '18px' }}>{expanded ? '▼' : '▶'}</span>
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="p-5">
          {/* Message */}
          {message && (
            <Alert variant={message.type === 'success' ? 'success' : 'error'} className="mb-4">
              {message.text}
            </Alert>
          )}

          {/* Error details */}
          {member.cron?.lastError && (
            <Alert
              variant="error"
              className="mb-4 font-mono text-mid whitespace-pre-wrap wrap-break-word"
            >
              {member.cron.lastError}
            </Alert>
          )}

          {/* Controls */}
          <div className="flex gap-3 mb-5 items-center flex-wrap">
            <Button
              variant="primary"
              size="lg"
              onClick={(e) => {
                e.stopPropagation()
                toggleEnabled()
              }}
              className={
                member.enabled ? 'bg-gray-500 hover:bg-gray-600' : 'bg-green-500 hover:bg-green-600'
              }
            >
              {member.enabled ? '🚫 Disable' : '✓ Enable'}
            </Button>

            {member.cron && (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleCron()
                  }}
                  className={
                    member.cron?.enabled
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-green-500 hover:bg-green-600'
                  }
                >
                  {member.cron?.enabled ? '⏸ Pause Cron' : '▶ Enable Cron'}
                </Button>

                <Button
                  variant="secondary"
                  size="lg"
                  onClick={(e) => {
                    e.stopPropagation()
                    triggerRun()
                  }}
                >
                  ▶ Run Now
                </Button>

                <Button
                  variant="danger"
                  size="lg"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteCron()
                  }}
                >
                  ✕ Delete Cron
                </Button>
              </>
            )}

            <Button
              variant="secondary"
              size="lg"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(member.id)
              }}
            >
              ✏️ Edit
            </Button>

            <Button
              variant="danger"
              size="lg"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(member.id)
              }}
            >
              🗑️ Delete
            </Button>

            <Link
              href={`/?assigned_to=${member.id}`}
              className="rounded-md font-medium transition-colors cursor-pointer px-4 py-2 text-sm bg-background border border-border text-foreground hover:bg-card no-underline"
            >
              View Tasks ({totalTasks})
            </Link>
          </div>

          {/* Schedule editing */}
          {member.cron && (
            <div className="flex gap-2 items-center mb-4">
              <span className="text-mid text-muted">Schedule:</span>
              <Input
                type="text"
                variant="mono"
                value={cronSchedule}
                onChange={(e) => setCronSchedule(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="0,15,30,45 * * * *"
                className="w-[200px] text-mid"
              />
              <Button
                variant={
                  cronSchedule !== (member.cron?.scheduleRaw || member.cron?.schedule)
                    ? 'primary'
                    : 'secondary'
                }
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  updateSchedule()
                }}
                disabled={cronSchedule === (member.cron?.scheduleRaw || member.cron?.schedule)}
              >
                Update
              </Button>
            </div>
          )}

          {/* Create Cron (when no cron exists) */}
          {!member.cron && (
            <div className="mb-4 p-3 rounded-lg bg-background border border-border">
              <span className="text-mid text-muted block mb-2">Create Cron Schedule:</span>
              <div className="flex gap-2 items-center">
                <Input
                  type="text"
                  variant="mono"
                  value={newCronSchedule}
                  onChange={(e) => setNewCronSchedule(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="0 */6 * * *"
                  className="w-[200px] text-mid"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    createCron()
                  }}
                >
                  Create
                </Button>
              </div>
            </div>
          )}

          {/* Cron History */}
          {member.cron && (
            <div className="mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  loadHistory()
                }}
                className="text-mid text-muted hover:text-foreground"
              >
                {historyExpanded ? '▼' : '▶'} Run History {historyLoading && '...'}
              </Button>
              {historyExpanded && cronHistory.length > 0 && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {cronHistory.map(
                    (
                      run: {
                        runId?: string
                        status?: string
                        startedAt?: string
                        durationMs?: number
                      },
                      i: number,
                    ) => (
                      <div
                        key={run.runId || i}
                        className="text-[12px] px-2 py-1 rounded-sm bg-background flex justify-between"
                      >
                        <span
                          className={
                            run.status === 'ok'
                              ? 'text-green-500'
                              : run.status === 'error'
                                ? 'text-red-500'
                                : 'text-muted'
                          }
                        >
                          {run.status || 'unknown'}
                        </span>
                        <span className="text-muted">
                          {run.startedAt
                            ? formatRelativeTime(new Date(run.startedAt).toISOString())
                            : ''}
                          {run.durationMs ? ` (${(run.durationMs / 1000).toFixed(1)}s)` : ''}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              )}
              {historyExpanded && cronHistory.length === 0 && !historyLoading && (
                <p className="text-[12px] text-muted mt-1">No run history available</p>
              )}
            </div>
          )}

          {/* Tools denied */}
          {member.toolsDenied && member.toolsDenied.length > 0 && (
            <div className="mb-4">
              <span className="text-mid text-muted">Denied tools: </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {member.toolsDenied.map((tool) => (
                  <span
                    key={tool}
                    className="text-xxs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-mono"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Context editor */}
          <AgentContextEditor agentId={member.id} />
        </div>
      )}
    </div>
  )
}
