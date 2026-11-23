'use client'

// IdentityEditor — typed editor for the AgentIdentity layer of the bundle.
//
// Edits structured fields (name, role, capabilities, constraints) directly
// against /api/agents/[agentId]/context (PATCH) so each save creates a new
// version with createdBy='ui:context'. Persona and instructions have their
// own tabs in AgentContextEditor.
//
// Rendered as the first tab of AgentContextEditor in the expanded squad row.
//
// Reference: ADR-003, apps/docs/src/content/docs/arquitectura/modelo-de-contexto.md.

import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import type { AgentCapability, AgentIdentity } from '@taia/types'
import { Alert, Button, Checkbox, Input, Label } from '@/components/atoms'

const CAPABILITY_OPTIONS: AgentCapability[] = [
  'read_tasks',
  'write_tasks',
  'comment_tasks',
  'read_stats',
  'read_own_files',
  'memory',
]

export function IdentityEditor({
  agentId,
  onSaved,
}: {
  agentId: string
  /** Called after a successful save, e.g. to refresh the version history. */
  onSaved?: () => void
}) {
  const t = useTranslations('agentsConfig.identity')
  const format = useFormatter()
  const [identity, setIdentity] = useState<AgentIdentity | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  // Load failures keep the raw detail; the sentence around it is translated at render.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [versionMeta, setVersionMeta] = useState<{
    versionId: string | null
    createdAt?: string | null
    createdBy?: string | null
  } | null>(null)

  // Local edits — diffed against `identity` to compute hasChanges.
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [capabilities, setCapabilities] = useState<AgentCapability[]>([])
  const [constraints, setConstraints] = useState<string[]>([])
  const [newConstraint, setNewConstraint] = useState('')

  // Loads once per mount: callers key the editor by agentId, so another id
  // starts from a fresh editor instead of resetting this one.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/agents/${agentId}/context`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const id: AgentIdentity | null = data.identity
        setIdentity(id)
        setVersionMeta({
          versionId: data.versionId ?? null,
          createdAt: data.versionCreatedAt ?? null,
          createdBy: data.versionCreatedBy ?? null,
        })
        setName(id?.name ?? '')
        setRole(id?.role ?? '')
        setCapabilities(id?.capabilities ?? [])
        setConstraints(id?.constraints ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agentId])

  const toggleCapability = (cap: AgentCapability) => {
    setCapabilities((prev) => (prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]))
  }

  const addConstraint = () => {
    const value = newConstraint.trim()
    if (!value) return
    setConstraints((prev) => [...prev, value])
    setNewConstraint('')
  }

  const removeConstraint = (idx: number) => {
    setConstraints((prev) => prev.filter((_, i) => i !== idx))
  }

  const hasChanges = (() => {
    if (!identity) return name || role || capabilities.length > 0 || constraints.length > 0
    if (name !== identity.name) return true
    if (role !== identity.role) return true
    if (capabilities.length !== identity.capabilities.length) return true
    if (capabilities.some((c) => !identity.capabilities.includes(c))) return true
    const cur = identity.constraints ?? []
    if (constraints.length !== cur.length) return true
    if (constraints.some((c, i) => cur[i] !== c)) return true
    return false
  })()

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/agents/${agentId}/context`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: {
            name,
            role,
            capabilities,
            constraints,
          },
          note: 'Edited via Identity tab',
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setIdentity(data.identity)
      setVersionMeta({ versionId: data.versionId })
      setMessage({ type: 'success', text: t('saved') })
      setTimeout(() => setMessage(null), 3000)
      onSaved?.()
    } catch (err) {
      setMessage({
        type: 'error',
        text: t('saveFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-muted text-mid p-4">{t('loading')}</div>
  }

  return (
    <div className="space-y-4">
      {loadError && <Alert variant="error">{t('loadFailed', { error: loadError })}</Alert>}
      {message && <Alert variant={message.type}>{message.text}</Alert>}

      {versionMeta?.versionId && (
        <div className="text-muted text-xs">
          {t('version', { id: `${versionMeta.versionId.slice(0, 12)}…` })}
          {versionMeta.createdAt
            ? ` · ${format.dateTime(new Date(versionMeta.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}`
            : ''}
          {versionMeta.createdBy ? ` · ${versionMeta.createdBy}` : ''}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`identity-name-${agentId}`}>{t('name')}</Label>
          <Input
            id={`identity-name-${agentId}`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`identity-role-${agentId}`}>{t('role')}</Label>
          <Input
            id={`identity-role-${agentId}`}
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label>{t('capabilities')}</Label>
        <p className="text-muted text-xs mb-2">{t('capabilitiesHint')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
          {CAPABILITY_OPTIONS.map((cap) => (
            <Checkbox
              key={cap}
              label={t(`caps.${cap}.label`)}
              description={t(`caps.${cap}.description`)}
              checked={capabilities.includes(cap)}
              onChange={() => toggleCapability(cap)}
            />
          ))}
        </div>
      </div>

      <div>
        <Label>{t('constraints')}</Label>
        <p className="text-muted text-xs mb-2">{t('constraintsHint')}</p>
        {constraints.length > 0 && (
          <ul className="space-y-1 mb-2">
            {constraints.map((c, i) => (
              <li
                key={`${i}-${c}`}
                className="flex items-center gap-2 text-mid bg-background rounded p-2"
              >
                <span className="flex-1">{c}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeConstraint(i)}
                  aria-label={t('removeConstraint', { n: i + 1 })}
                >
                  <X size={14} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            type="text"
            value={newConstraint}
            aria-label={t('newConstraint')}
            placeholder={t('newConstraintPlaceholder')}
            onChange={(e) => setNewConstraint(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addConstraint()
              }
            }}
          />
          <Button
            variant="secondary"
            size="md"
            onClick={addConstraint}
            disabled={newConstraint.trim().length === 0}
          >
            {t('addConstraint')}
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        {hasChanges && <span className="text-person-ink text-mid self-center">{t('unsaved')}</span>}
        <Button
          variant={hasChanges ? 'primary' : 'secondary'}
          size="lg"
          onClick={save}
          disabled={!hasChanges || saving}
        >
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  )
}
