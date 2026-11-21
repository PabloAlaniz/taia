'use client'

// IdentityEditor — typed editor for the AgentIdentity layer of the bundle.
//
// Edits structured fields (name, role, capabilities, constraints) directly
// against /api/agents/[agentId]/context (PATCH) so each save creates a new
// version with createdBy='ui:context'. Persona and instructions have their
// own tabs in AgentContextEditor.
//
// Reference: ADR-003, apps/docs/src/content/docs/arquitectura/modelo-de-contexto.md.

import { useEffect, useState } from 'react'
import type { AgentCapability, AgentIdentity } from '@taia/types'
import { Alert, Button, Checkbox, Input, Label } from '@/components/atoms'

interface CapabilityOption {
  value: AgentCapability
  label: string
  description: string
}

const CAPABILITY_OPTIONS: CapabilityOption[] = [
  { value: 'read_tasks', label: 'Read tasks', description: 'List and inspect tasks' },
  {
    value: 'write_tasks',
    label: 'Write tasks',
    description: 'Create and update tasks',
  },
  {
    value: 'comment_tasks',
    label: 'Comment on tasks',
    description: 'Post messages to a task',
  },
  { value: 'read_stats', label: 'Read stats', description: 'Read dashboard metrics' },
  {
    value: 'read_own_files',
    label: 'Read own files',
    description: 'Read its own persona, instructions, working notes and memory on demand',
  },
  {
    value: 'memory',
    label: 'Memory tool',
    description: 'Persistent filesystem-like memory the agent edits itself',
  },
]

export function IdentityEditor({ agentId }: { agentId: string }) {
  const [identity, setIdentity] = useState<AgentIdentity | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
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
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : String(err),
        })
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
      setMessage({ type: 'success', text: 'Identity saved.' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-muted text-mid p-4">Loading identity…</div>
  }

  return (
    <div className="space-y-4">
      {message && <Alert variant={message.type}>{message.text}</Alert>}

      {versionMeta?.versionId && (
        <div className="text-muted text-xs">
          Version {versionMeta.versionId.slice(0, 12)}…
          {versionMeta.createdAt ? ` • ${new Date(versionMeta.createdAt).toLocaleString()}` : ''}
          {versionMeta.createdBy ? ` • ${versionMeta.createdBy}` : ''}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`identity-name-${agentId}`}>Name</Label>
          <Input
            id={`identity-name-${agentId}`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`identity-role-${agentId}`}>Role</Label>
          <Input
            id={`identity-role-${agentId}`}
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label>Capabilities</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
          {CAPABILITY_OPTIONS.map((opt) => (
            <Checkbox
              key={opt.value}
              label={opt.label}
              description={opt.description}
              checked={capabilities.includes(opt.value)}
              onChange={() => toggleCapability(opt.value)}
            />
          ))}
        </div>
      </div>

      <div>
        <Label>Constraints</Label>
        <p className="text-muted text-xs mb-2">
          Hard limits (e.g. &quot;never approve a PR without tests&quot;). Listed here, applied in
          the system prompt.
        </p>
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
                  aria-label={`Remove constraint ${i + 1}`}
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            type="text"
            value={newConstraint}
            placeholder="Add a constraint…"
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
            Add
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        {hasChanges && (
          <span className="text-yellow-500 text-mid self-center">● Unsaved changes</span>
        )}
        <Button
          variant={hasChanges ? 'primary' : 'secondary'}
          size="lg"
          onClick={save}
          disabled={!hasChanges || saving}
        >
          {saving ? 'Saving…' : 'Save identity'}
        </Button>
      </div>
    </div>
  )
}
