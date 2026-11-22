'use client'

import { useTranslations } from 'next-intl'
// /settings/profile — typed editor for the UserProfile bundle layer.
//
// Single-user TAIA today (singleton id='default'); the route therefore
// uses /api/user/profile (no userId in URL). Edits are append-only via
// the standard agent_context versioning machinery; rollback through the
// History drawer.
//
// Reference: ADR-003, apps/docs/src/content/docs/arquitectura/modelo-de-contexto.md.

import { useCallback, useEffect, useState } from 'react'
import type { UserProfile } from '@taia/types'
import { Alert, Button, Input, Label } from '@/components/atoms'
import { fetchJson, useResource } from '@/lib/use-resource'
import { PageHeader } from '@/components/molecules/page-header'

interface ProfileVersionEntry {
  versionId: string
  content: UserProfile
  createdAt: string
  createdBy: string | null
  note: string | null
}

function ProfileVersionDrawer({
  isOpen,
  onClose,
  onRestored,
}: {
  isOpen: boolean
  onClose: () => void
  onRestored: () => void
}) {
  const versionsUrl = '/api/user/profile/versions'
  const history = useResource(isOpen ? versionsUrl : null, () =>
    fetchJson<{ versions?: ProfileVersionEntry[] }>(versionsUrl),
  )
  const versions = history.data ? (history.data.versions ?? []) : null
  const [restoring, setRestoring] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const error = restoreError ?? history.error

  const close = () => {
    setRestoreError(null)
    onClose()
  }

  const restore = async (versionId: string) => {
    setRestoring(versionId)
    setRestoreError(null)
    try {
      const res = await fetch(`/api/user/profile/versions/${versionId}/restore`, {
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
          <h3 className="text-lg font-semibold">Version history</h3>
          <Button variant="ghost" size="sm" onClick={close}>
            ×
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && <Alert variant="error">{error}</Alert>}
          {!versions && !error && <div className="text-muted text-sm">Loading…</div>}
          {versions && versions.length === 0 && (
            <div className="text-muted text-sm">No versions yet.</div>
          )}
          {versions?.map((v, i) => (
            <div key={v.versionId} className="border border-border rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm">
                  <div className="font-medium">
                    {i === 0 ? 'Current — ' : ''}
                    {new Date(v.createdAt).toLocaleString()}
                  </div>
                  <div className="text-muted text-xs">
                    {v.createdBy ?? 'unknown'}
                    {v.note ? ` — ${v.note}` : ''}
                  </div>
                  <div className="text-muted text-xs mt-1">
                    {v.content.displayName} • {v.content.facts?.length ?? 0} facts •{' '}
                    {Object.keys(v.content.preferences ?? {}).length} prefs •{' '}
                    {v.content.doNotDo?.length ?? 0} do-nots
                  </div>
                </div>
                {i > 0 && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => restore(v.versionId)}
                    disabled={restoring !== null}
                  >
                    {restoring === v.versionId ? 'Restoring…' : 'Restore'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function UserProfilePage() {
  const tp = useTranslations('pageTitles')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [versionMeta, setVersionMeta] = useState<{
    versionId: string | null
    createdAt?: string | null
    createdBy?: string | null
  } | null>(null)

  // Local edits.
  const [displayName, setDisplayName] = useState('')
  const [facts, setFacts] = useState<string[]>([])
  const [newFact, setNewFact] = useState('')
  const [prefs, setPrefs] = useState<Array<[string, string]>>([])
  const [prefKey, setPrefKey] = useState('')
  const [prefValue, setPrefValue] = useState('')
  const [doNotDo, setDoNotDo] = useState<string[]>([])
  const [newDoNotDo, setNewDoNotDo] = useState('')

  const fetchProfile = useCallback(() => {
    fetch('/api/user/profile')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        const p: UserProfile = data.profile
        setProfile(p)
        setVersionMeta({
          versionId: data.versionId ?? null,
          createdAt: data.versionCreatedAt ?? null,
          createdBy: data.versionCreatedBy ?? null,
        })
        setDisplayName(p.displayName ?? '')
        setFacts(p.facts ?? [])
        setPrefs(
          Object.entries(p.preferences ?? {}).map(
            ([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string],
          ),
        )
        setDoNotDo(p.doNotDo ?? [])
      })
      .catch((err) =>
        setMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) }),
      )
      .finally(() => setLoading(false))
  }, [])

  useEffect(fetchProfile, [fetchProfile])

  const addFact = () => {
    const v = newFact.trim()
    if (!v) return
    setFacts((prev) => [...prev, v])
    setNewFact('')
  }
  const removeFact = (idx: number) => setFacts((prev) => prev.filter((_, i) => i !== idx))

  const addPref = () => {
    const k = prefKey.trim()
    const v = prefValue.trim()
    if (!k || !v) return
    if (prefs.some(([existing]) => existing === k)) {
      setMessage({ type: 'error', text: `Preference "${k}" already set.` })
      setTimeout(() => setMessage(null), 3000)
      return
    }
    setPrefs((prev) => [...prev, [k, v]])
    setPrefKey('')
    setPrefValue('')
  }
  const removePref = (idx: number) => setPrefs((prev) => prev.filter((_, i) => i !== idx))

  const addDoNotDo = () => {
    const v = newDoNotDo.trim()
    if (!v) return
    setDoNotDo((prev) => [...prev, v])
    setNewDoNotDo('')
  }
  const removeDoNotDo = (idx: number) => setDoNotDo((prev) => prev.filter((_, i) => i !== idx))

  const hasChanges = (() => {
    if (!profile) {
      return displayName.length > 0 || facts.length > 0 || prefs.length > 0 || doNotDo.length > 0
    }
    if (displayName !== (profile.displayName ?? '')) return true
    const curFacts = profile.facts ?? []
    if (facts.length !== curFacts.length) return true
    if (facts.some((f, i) => curFacts[i] !== f)) return true
    const curPrefs = Object.entries(profile.preferences ?? {})
    if (prefs.length !== curPrefs.length) return true
    if (prefs.some(([k, v], i) => curPrefs[i]?.[0] !== k || String(curPrefs[i]?.[1]) !== v)) {
      return true
    }
    const curDoNotDo = profile.doNotDo ?? []
    if (doNotDo.length !== curDoNotDo.length) return true
    if (doNotDo.some((d, i) => curDoNotDo[i] !== d)) return true
    return false
  })()

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            displayName,
            facts,
            preferences: Object.fromEntries(prefs),
            doNotDo,
          },
          note: 'Edited via Profile page',
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setProfile(data.profile)
      setVersionMeta({ versionId: data.versionId })
      setMessage({ type: 'success', text: 'Profile saved.' })
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

  return (
    <div className="min-h-full bg-background">
      <PageHeader
        width="form"
        title={tp('profile')}
        backHref="/settings"
        backLabel={tp('settings')}
      />
      <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto space-y-6">
        <p className="text-muted text-sm">
          What every agent knows about you. Edited fields are versioned — restore any past state via
          History.
        </p>

        {message && <Alert variant={message.type}>{message.text}</Alert>}

        {versionMeta?.versionId && (
          <div className="text-muted text-xs">
            Version {versionMeta.versionId.slice(0, 12)}…
            {versionMeta.createdAt ? ` • ${new Date(versionMeta.createdAt).toLocaleString()}` : ''}
            {versionMeta.createdBy ? ` • ${versionMeta.createdBy}` : ''}
          </div>
        )}

        {loading ? (
          <div className="text-muted text-sm">Loading profile…</div>
        ) : (
          <>
            <div>
              <Label htmlFor="profile-displayName">Display name</Label>
              <Input
                id="profile-displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What agents should call you"
              />
            </div>

            <ListField
              label="Facts"
              hint="Things every agent should remember (e.g. role, location, current focus)."
              items={facts}
              newValue={newFact}
              onNewValue={setNewFact}
              onAdd={addFact}
              onRemove={removeFact}
              ariaLabel="fact"
              placeholder="Add a fact…"
            />

            <div>
              <Label>Preferences</Label>
              <p className="text-muted text-xs mb-2">
                Key→value preferences (tone, language, formats). Stored as a flat object in the
                bundle.
              </p>
              {prefs.length > 0 && (
                <ul className="space-y-1 mb-2">
                  {prefs.map(([k, v], i) => (
                    <li
                      key={`${i}-${k}`}
                      className="flex items-center gap-2 text-sm bg-card rounded p-2"
                    >
                      <span className="font-medium">{k}</span>
                      <span className="text-muted">→</span>
                      <span className="flex-1">{v}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePref(i)}
                        aria-label={`Remove preference ${i + 1}`}
                      >
                        ×
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
                <Input
                  type="text"
                  value={prefKey}
                  placeholder="Key"
                  onChange={(e) => setPrefKey(e.target.value)}
                />
                <Input
                  type="text"
                  value={prefValue}
                  placeholder="Value"
                  onChange={(e) => setPrefValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addPref()
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  size="md"
                  onClick={addPref}
                  disabled={!prefKey.trim() || !prefValue.trim()}
                >
                  Add
                </Button>
              </div>
            </div>

            <ListField
              label="Do NOT"
              hint='Anti-preferences applied as constraints in the system prompt (e.g. "guess when uncertain").'
              items={doNotDo}
              newValue={newDoNotDo}
              onNewValue={setNewDoNotDo}
              onAdd={addDoNotDo}
              onRemove={removeDoNotDo}
              ariaLabel="do-not"
              placeholder="Add an anti-preference…"
            />

            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              {hasChanges && (
                <span className="text-yellow-500 text-sm self-center">● Unsaved changes</span>
              )}
              <Button variant="secondary" size="lg" onClick={() => setHistoryOpen(true)}>
                History
              </Button>
              <Button
                variant={hasChanges ? 'primary' : 'secondary'}
                size="lg"
                onClick={save}
                disabled={!hasChanges || saving}
              >
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </>
        )}
      </div>

      <ProfileVersionDrawer
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={() => {
          setMessage({ type: 'success', text: 'Profile restored.' })
          setTimeout(() => setMessage(null), 3000)
          fetchProfile()
        }}
      />
    </div>
  )
}

function ListField({
  label,
  hint,
  items,
  newValue,
  onNewValue,
  onAdd,
  onRemove,
  ariaLabel,
  placeholder,
}: {
  label: string
  hint: string
  items: string[]
  newValue: string
  onNewValue: (v: string) => void
  onAdd: () => void
  onRemove: (idx: number) => void
  ariaLabel: string
  placeholder: string
}) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="text-muted text-xs mb-2">{hint}</p>
      {items.length > 0 && (
        <ul className="space-y-1 mb-2">
          {items.map((item, i) => (
            <li
              key={`${i}-${item}`}
              className="flex items-center gap-2 text-sm bg-card rounded p-2"
            >
              <span className="flex-1">{item}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${ariaLabel} ${i + 1}`}
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
          value={newValue}
          placeholder={placeholder}
          onChange={(e) => onNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAdd()
            }
          }}
        />
        <Button
          variant="secondary"
          size="md"
          onClick={onAdd}
          disabled={newValue.trim().length === 0}
        >
          Add
        </Button>
      </div>
    </div>
  )
}
