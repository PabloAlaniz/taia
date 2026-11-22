'use client'

// ProjectContextEditor — typed editor for the project layer of the bundle.
//
// Edits description, glossary (key-value), and knowledgeRefs (typed list)
// against /api/projects/[projectId]/context. Each save creates a new
// project_context_versions row and mirrors glossary/knowledge_refs onto
// the projects row. Append-only; rollback via the version history drawer.
//
// Reference: ADR-003, apps/docs/src/content/docs/arquitectura/modelo-de-contexto.md.

import { useEffect, useState } from 'react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import type { KnowledgeRef, ProjectContext } from '@taia/types'
import { Alert, Button, Checkbox, Input, Label, Select, Textarea } from '@/components/atoms'

const KNOWLEDGE_KINDS: Array<KnowledgeRef['kind']> = ['url', 'doc', 'vector_store', 'file']

export function ProjectContextEditor({ projectId }: { projectId: string }) {
  const t = useTranslations('settingsProjectContext')
  const tc = useTranslations('settingsCommon')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const [context, setContext] = useState<ProjectContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [versionMeta, setVersionMeta] = useState<{
    versionId: string | null
    createdAt?: string | null
    createdBy?: string | null
  } | null>(null)

  // Local edits.
  const [description, setDescription] = useState('')
  const [glossary, setGlossary] = useState<Array<[string, string]>>([])
  const [glossaryKey, setGlossaryKey] = useState('')
  const [glossaryValue, setGlossaryValue] = useState('')
  const [refs, setRefs] = useState<KnowledgeRef[]>([])
  const [newRef, setNewRef] = useState<KnowledgeRef>({
    kind: 'doc',
    uri: '',
    description: '',
    cacheable: true,
  })

  // Loads once per mount: callers key the editor by projectId, so another id
  // starts from a fresh editor instead of resetting this one.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${projectId}/context`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const c: ProjectContext | null = data.context
        setContext(c)
        setVersionMeta({
          versionId: data.versionId ?? null,
          createdAt: data.versionCreatedAt ?? null,
          createdBy: data.versionCreatedBy ?? null,
        })
        setDescription(c?.description ?? '')
        setGlossary(Object.entries(c?.glossary ?? {}))
        setRefs(c?.knowledgeRefs ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        setMessage({
          type: 'error',
          text: t('loadFailed', { error: err instanceof Error ? err.message : String(err) }),
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // t is stable per locale; the effect only re-runs for another project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const addGlossaryEntry = () => {
    const k = glossaryKey.trim()
    const v = glossaryValue.trim()
    if (!k || !v) return
    if (glossary.some(([existing]) => existing === k)) {
      setMessage({ type: 'error', text: t('duplicateTerm', { term: k }) })
      setTimeout(() => setMessage(null), 3000)
      return
    }
    setGlossary((prev) => [...prev, [k, v]])
    setGlossaryKey('')
    setGlossaryValue('')
  }

  const removeGlossaryEntry = (idx: number) => {
    setGlossary((prev) => prev.filter((_, i) => i !== idx))
  }

  const addRef = () => {
    const uri = newRef.uri.trim()
    const description = newRef.description.trim()
    if (!uri || !description) return
    setRefs((prev) => [...prev, { ...newRef, uri, description }])
    setNewRef({ kind: 'doc', uri: '', description: '', cacheable: true })
  }

  const removeRef = (idx: number) => {
    setRefs((prev) => prev.filter((_, i) => i !== idx))
  }

  const hasChanges = (() => {
    if (!context) return description || glossary.length > 0 || refs.length > 0
    if (description !== (context.description ?? '')) return true
    const curGlossary = Object.entries(context.glossary ?? {})
    if (glossary.length !== curGlossary.length) return true
    if (glossary.some(([k, v], i) => curGlossary[i]?.[0] !== k || curGlossary[i]?.[1] !== v)) {
      return true
    }
    const curRefs = context.knowledgeRefs ?? []
    if (refs.length !== curRefs.length) return true
    if (
      refs.some(
        (r, i) =>
          curRefs[i]?.kind !== r.kind ||
          curRefs[i]?.uri !== r.uri ||
          curRefs[i]?.description !== r.description ||
          curRefs[i]?.cacheable !== r.cacheable,
      )
    ) {
      return true
    }
    return false
  })()

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/context`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            description,
            glossary: Object.fromEntries(glossary),
            knowledgeRefs: refs,
          },
          note: t('versionNote'),
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setContext(data.context)
      setVersionMeta({ versionId: data.versionId })
      setMessage({ type: 'success', text: t('saved') })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setMessage({
        type: 'error',
        text: t('saveFailed', { error: err instanceof Error ? err.message : String(err) }),
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="text-muted text-xs p-2" role="status">
        {t('loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {message && <Alert variant={message.type}>{message.text}</Alert>}

      {versionMeta?.versionId && (
        <div className="text-muted text-xs">
          {tc('version', { id: versionMeta.versionId.slice(0, 12) })}
          {versionMeta.createdAt && (
            <>
              {' · '}
              <time
                dateTime={versionMeta.createdAt}
                title={format.dateTime(new Date(versionMeta.createdAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              >
                {format.relativeTime(
                  new Date(Math.min(new Date(versionMeta.createdAt).getTime(), now.getTime())),
                  now,
                )}
              </time>
            </>
          )}
          {versionMeta.createdBy ? ` · ${versionMeta.createdBy}` : ''}
        </div>
      )}

      <div>
        <Label htmlFor={`pc-desc-${projectId}`}>{t('descriptionLabel')}</Label>
        <Textarea
          id={`pc-desc-${projectId}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-[80px] p-2"
          placeholder={t('descriptionPlaceholder')}
        />
      </div>

      <div>
        <Label>{t('glossaryLabel')}</Label>
        <p className="text-muted text-xs mb-2">{t('glossaryHelp')}</p>
        {glossary.length > 0 && (
          <ul className="space-y-1 mb-2">
            {glossary.map(([k, v], i) => (
              <li
                key={`${i}-${k}`}
                className="flex items-center gap-2 text-xs bg-background rounded p-2"
              >
                <span className="font-medium">{k}</span>
                <span className="text-muted">→</span>
                <span className="flex-1">{v}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeGlossaryEntry(i)}
                  aria-label={t('removeTerm', { term: k })}
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
          <Input
            type="text"
            value={glossaryKey}
            placeholder={t('termPlaceholder')}
            onChange={(e) => setGlossaryKey(e.target.value)}
          />
          <Input
            type="text"
            value={glossaryValue}
            placeholder={t('definitionPlaceholder')}
            onChange={(e) => setGlossaryValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addGlossaryEntry()
              }
            }}
          />
          <Button
            variant="secondary"
            size="md"
            onClick={addGlossaryEntry}
            disabled={!glossaryKey.trim() || !glossaryValue.trim()}
          >
            {t('addTerm')}
          </Button>
        </div>
      </div>

      <div>
        <Label>{t('refsLabel')}</Label>
        <p className="text-muted text-xs mb-2">{t('refsHelp')}</p>
        {refs.length > 0 && (
          <ul className="space-y-1 mb-2">
            {refs.map((r, i) => (
              <li
                key={`${i}-${r.uri}`}
                className="flex items-center gap-2 text-xs bg-background rounded p-2"
              >
                <span className="text-muted text-2xs uppercase">{t(`kinds.${r.kind}`)}</span>
                <span className="font-medium truncate max-w-[200px]">{r.uri}</span>
                <span className="text-muted">—</span>
                <span className="flex-1 truncate">{r.description}</span>
                {r.cacheable && (
                  <span className="text-2xs bg-accent/20 text-accent px-1.5 py-0.5 rounded-sm">
                    {t('cacheableBadge')}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRef(i)}
                  aria-label={t('removeRef', { uri: r.uri })}
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2 bg-background rounded p-2 border border-border">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <Select
              aria-label={t('kindLabel')}
              value={newRef.kind}
              onChange={(e) =>
                setNewRef((prev) => ({ ...prev, kind: e.target.value as KnowledgeRef['kind'] }))
              }
            >
              {KNOWLEDGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </Select>
            <Input
              type="text"
              value={newRef.uri}
              placeholder={t('uriPlaceholder')}
              onChange={(e) => setNewRef((prev) => ({ ...prev, uri: e.target.value }))}
            />
          </div>
          <Input
            type="text"
            value={newRef.description}
            placeholder={t('refDescPlaceholder')}
            onChange={(e) => setNewRef((prev) => ({ ...prev, description: e.target.value }))}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={newRef.cacheable}
                onChange={(e) => setNewRef((prev) => ({ ...prev, cacheable: e.target.checked }))}
              />
              {t('cacheableLabel')}
            </label>
            <Button
              variant="secondary"
              size="md"
              onClick={addRef}
              disabled={!newRef.uri.trim() || !newRef.description.trim()}
            >
              {t('addRef')}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        {hasChanges && (
          <span className="text-accent text-xs self-center" role="status">
            {tc('unsaved')}
          </span>
        )}
        <Button
          variant={hasChanges ? 'primary' : 'secondary'}
          size="lg"
          onClick={save}
          disabled={!hasChanges || saving}
        >
          {saving ? tc('saving') : t('save')}
        </Button>
      </div>
    </div>
  )
}
