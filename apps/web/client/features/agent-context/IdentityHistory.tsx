'use client'

// IdentityHistory — the versions of an agent's identity bundle, newest first,
// with a preview of persona and instructions and a restore for older ones.
// Each save of identity, persona or instructions creates a version
// (GET /api/agents/[id]/context/versions); restoring one creates a new
// version with that content (POST .../versions/[versionId]/restore).

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Alert, Button } from '@/components/atoms'
import { fetchJson, useResource } from '@/lib/use-resource'

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

const PREVIEW_CHARS = 200

export function IdentityHistory({
  agentId,
  onRestored,
}: {
  agentId: string
  /** Called after a successful restore, e.g. to reload the editors. */
  onRestored: () => void
}) {
  const t = useTranslations('agentsConfig.history')
  const tc = useTranslations('agentContext.sections')
  const tg = useTranslations('agentsConfig.guide')
  const format = useFormatter()
  const versionsUrl = `/api/agents/${agentId}/context/versions`
  const history = useResource(versionsUrl, () =>
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
      setExpanded(null)
      history.reload()
      onRestored()
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err))
    } finally {
      setRestoring(null)
    }
  }

  const preview = (text: string | undefined) => {
    const value = text ?? ''
    if (!value) return t('emptyField')
    return value.length > PREVIEW_CHARS ? `${value.slice(0, PREVIEW_CHARS)}…` : value
  }

  return (
    <div className="mt-2 space-y-2">
      {error && <Alert variant="error">{error}</Alert>}
      {!versions && !error && (
        <p className="text-sm text-muted" role="status">
          {t('loading')}
        </p>
      )}
      {versions && versions.length === 0 && <p className="text-sm text-muted">{t('empty')}</p>}

      {versions && versions.length > 0 && (
        <p className="text-xs text-muted max-w-prose">{tg('changes')}</p>
      )}
      {versions && versions.length > 0 && (
        <ol className="max-h-96 overflow-y-auto divide-y divide-border/60 text-sm">
          {versions.map((v, i) => {
            const isOpen = expanded === v.versionId
            const date = format.dateTime(new Date(v.createdAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
            return (
              <li key={v.versionId} className="py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium tabular-nums">
                      {i === 0 ? t('current', { date }) : date}
                    </div>
                    <div className="text-muted text-xs">
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
                        variant="secondary"
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
                  <div className="mt-2 grid gap-2">
                    <div>
                      <div className="text-muted text-xs mb-1">{tc('persona')}</div>
                      <pre className="bg-background rounded p-2 whitespace-pre-wrap wrap-break-word font-mono text-xs">
                        {preview(v.content.persona)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-muted text-xs mb-1">{tc('instructions')}</div>
                      <pre className="bg-background rounded p-2 whitespace-pre-wrap wrap-break-word font-mono text-xs">
                        {preview(v.content.instructions)}
                      </pre>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
