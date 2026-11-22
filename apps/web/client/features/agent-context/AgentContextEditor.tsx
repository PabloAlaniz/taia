'use client'

// AgentContextEditor — edits the parts of an agent's context people write as
// prose: persona and instructions (typed identity, PATCH /context), working
// notes (/working-state) and memory files (/memory/<name>). Each runtime
// renders them its own way (SOUL.md / AGENTS.md for OpenClaw, system blocks
// for Anthropic), so the UI never edits generated markdown. See ADR-005.

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Alert, Button, Select, Textarea } from '@/components/atoms'

type Section = 'persona' | 'instructions' | 'working' | 'memory'

const SECTIONS: Section[] = ['persona', 'instructions', 'working', 'memory']

export interface ExtraTab {
  key: string
  label: string
  content: ReactNode
}

interface AgentContextEditorProps {
  agentId: string
  /** Tabs rendered before the context sections (e.g. the structured identity). */
  extraTabs?: ExtraTab[]
  /** Called after any successful save, e.g. to refresh history. */
  onSaved?: () => void
}

interface Loaded {
  persona: string
  instructions: string
  working: string
  memoryFiles: string[]
}

export function AgentContextEditor({ agentId, extraTabs = [], onSaved }: AgentContextEditorProps) {
  const t = useTranslations('agentContext')
  const [active, setActive] = useState<string>(extraTabs[0]?.key ?? 'persona')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [selectedMemory, setSelectedMemory] = useState('')
  const [memoryContent, setMemoryContent] = useState('')
  // Unsaved edits per tab; a tab without an entry shows the saved value.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/agents/${agentId}/context`).then((r) => r.json()),
      fetch(`/api/agents/${agentId}/working-state`).then((r) => r.json()),
      fetch(`/api/agents/${agentId}/memory`).then((r) => r.json()),
    ])
      .then(([context, working, memory]) => {
        if (cancelled) return
        setLoaded({
          persona: context.identity?.persona ?? '',
          instructions: context.identity?.instructions ?? '',
          working: working.content ?? '',
          memoryFiles: memory.files ?? [],
        })
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [agentId])

  const section = SECTIONS.find((s) => s === active)

  const saved = !loaded || !section ? '' : section === 'memory' ? memoryContent : loaded[section]

  const draft = drafts[active] ?? saved
  const setDraft = (value: string) => setDrafts((prev) => ({ ...prev, [active]: value }))
  const clearDraft = () =>
    setDrafts((prev) => {
      const { [active]: _discarded, ...rest } = prev
      return rest
    })

  const openMemory = async (name: string) => {
    clearDraft()
    setSelectedMemory(name)
    if (!name) {
      setMemoryContent('')
      return
    }
    try {
      const res = await fetch(`/api/agents/${agentId}/memory/${name}`)
      const data = await res.json()
      setMemoryContent(data.content ?? '')
    } catch {
      setMessage({
        type: 'error',
        text: t('memoryLoadFailed', { file: name }),
      })
    }
  }

  const save = async () => {
    if (!section || !loaded) return
    setSaving(true)
    setMessage(null)
    try {
      let res: Response
      if (section === 'persona' || section === 'instructions') {
        res = await fetch(`/api/agents/${agentId}/context`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identity: { [section]: draft },
            note: `Edited ${section}`,
          }),
        })
      } else if (section === 'working') {
        res = await fetch(`/api/agents/${agentId}/working-state`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: draft, updatedBy: 'ui' }),
        })
      } else {
        res = await fetch(`/api/agents/${agentId}/memory/${selectedMemory}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: draft }),
        })
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '')

      if (section === 'memory') setMemoryContent(draft)
      else setLoaded({ ...loaded, [section]: draft })
      clearDraft()
      setMessage({ type: 'success', text: t('saved') })
      setTimeout(() => setMessage(null), 3000)
      onSaved?.()
    } catch (err) {
      const detail = err instanceof Error ? err.message : ''
      setMessage({
        type: 'error',
        text: detail ? t('saveFailedWith', { error: detail }) : t('saveFailed'),
      })
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    ...extraTabs.map((t) => ({ key: t.key, label: t.label })),
    ...SECTIONS.filter((s) => s !== 'memory' || (loaded?.memoryFiles.length ?? 0) > 0).map((s) => ({
      key: s,
      label:
        s === 'memory'
          ? t('memoryTab', { count: loaded?.memoryFiles.length ?? 0 })
          : t(`sections.${s}`),
    })),
  ]
  const extra = extraTabs.find((tab) => tab.key === active)
  const hasChanges = Boolean(section) && draft !== saved

  return (
    <>
      {loadFailed && (
        <Alert variant="error" className="mb-4">
          {t('loadFailed')}
        </Alert>
      )}
      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'} className="mb-4">
          {message.text}
        </Alert>
      )}

      <div className="flex gap-1 mb-3 flex-wrap" role="tablist" aria-label={t('tabs')}>
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant="ghost"
            size="lg"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={cn(
              'rounded-none rounded-t-lg border-b-2',
              active === tab.key ? 'border-accent bg-background' : 'border-transparent text-muted',
            )}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {extra ? (
        extra.content
      ) : section ? (
        <>
          <p className="text-mid text-muted mb-2">{t(`hints.${section}`)}</p>

          {section === 'memory' && (
            <Select
              aria-label={t('memoryFile')}
              value={selectedMemory}
              onChange={(e) => openMemory(e.target.value)}
              className="mb-3"
            >
              <option value="">{t('memoryPick')}</option>
              {loaded?.memoryFiles.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          )}

          <Textarea
            aria-label={t(`sections.${section}`)}
            variant="mono"
            resizable
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!loaded || (section === 'memory' && !selectedMemory)}
            className="min-h-[350px] p-4"
          />

          <div className="mt-3 flex justify-end gap-3">
            {hasChanges && (
              <span className="text-person-ink text-mid self-center">{t('unsaved')}</span>
            )}
            <Button
              variant={hasChanges ? 'primary' : 'secondary'}
              size="lg"
              onClick={save}
              disabled={!hasChanges || saving || (section === 'memory' && !selectedMemory)}
              className="px-5"
            >
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
        </>
      ) : null}
    </>
  )
}
