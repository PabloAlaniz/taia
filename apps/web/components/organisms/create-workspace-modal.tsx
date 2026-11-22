'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Plus, X } from 'lucide-react'
import { Button, Input } from '../atoms'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../molecules/modal'
import { useStore } from '@/lib/store'
import { api } from '@/lib/api'
import type { WorkspacePreset, Agent } from '@taia/types'

interface ColumnInput {
  slug: string
  label: string
  icon: string
  is_initial_state: boolean
  is_done_state: boolean
}

interface NewAgentInput {
  id: string
  name: string
  role: string
  avatar: string
  type: string
}

type ColumnMode = 'preset' | 'ai'

const AI_EXAMPLE_KEYS = ['software', 'marketing', 'editorial', 'sales'] as const

interface CreateWorkspaceModalProps {
  open: boolean
  onClose: () => void
  fullScreen?: boolean
}

export function CreateWorkspaceModal({ open, ...props }: CreateWorkspaceModalProps) {
  // Mounted per opening, so every opening starts from a clean form.
  if (!open) return null
  return <CreateWorkspaceForm {...props} />
}

function CreateWorkspaceForm({ onClose, fullScreen }: Omit<CreateWorkspaceModalProps, 'open'>) {
  const t = useTranslations('workspaceForm')
  const tc = useTranslations('common')
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [presets, setPresets] = useState<WorkspacePreset[]>([])
  const [existingAgents, setExistingAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(false)

  // Column configuration
  const [columnMode, setColumnMode] = useState<ColumnMode>('preset')
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [customColumns, setCustomColumns] = useState<ColumnInput[]>([])

  // AI generation
  const [aiPrompt, setAiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiAgents, setAiAgents] = useState<NewAgentInput[]>([])

  // Agent assignment
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set())
  const [newAgents, setNewAgents] = useState<NewAgentInput[]>([])
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentRole, setNewAgentRole] = useState('')

  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace)
  const refresh = useStore((s) => s.refresh)

  useEffect(() => {
    api.workspaces.presets.list().then((res) => setPresets(res.presets || []))
    api.agents
      .list()
      .then((res) => {
        setExistingAgents(res.agents || [])
        // Auto-select all existing agents
        setSelectedAgentIds(new Set((res.agents || []).map((a) => a.id)))
      })
      .catch(() => setExistingAgents([]))
  }, [])

  const hasColumns = columnMode === 'preset' ? !!selectedPresetId : customColumns.length >= 2
  const allNewAgents = [...aiAgents, ...newAgents]
  const canCreate = name.trim() && hasColumns

  async function handleGenerate(need: string) {
    const input = need || aiPrompt
    if (!input || input.length < 3) return

    setGenerating(true)
    setGenerateError(null)
    try {
      type GeneratedSetup = {
        workspace: { name?: string; columns: ColumnInput[] }
        agents: Array<{
          id: string
          name: string
          role?: string
          avatar?: string
          type?: string
        }>
      }
      const res = await api.onboarding.generateSetup(input)
      const setup = res.setup as GeneratedSetup | undefined
      if (res.ok && setup) {
        setCustomColumns(setup.workspace.columns)
        setAiAgents(
          setup.agents.map((a) => ({
            id: a.id,
            name: a.name,
            role: a.role || '',
            avatar: a.avatar || '🤖',
            type: a.type || 'cron',
          })),
        )
        if (!name.trim() && setup.workspace.name) {
          setName(setup.workspace.name)
        }
      } else {
        setGenerateError(t('generateFailed'))
      }
    } catch (e) {
      console.error('AI generation failed:', e instanceof Error ? e.message : String(e))
      setGenerateError(t('generateFailed'))
    }
    setGenerating(false)
  }

  function updateColumn(index: number, updates: Partial<ColumnInput>) {
    setCustomColumns((cols) => cols.map((col, i) => (i === index ? { ...col, ...updates } : col)))
  }

  function removeColumn(index: number) {
    if (customColumns.length <= 2) return
    setCustomColumns((cols) => cols.filter((_, i) => i !== index))
  }

  function addColumn() {
    setCustomColumns((cols) => [
      ...cols,
      {
        slug: `NEW_${Date.now()}`,
        label: t('newColumn'),
        icon: '📌',
        is_initial_state: false,
        is_done_state: false,
      },
    ])
  }

  function updateAiAgent(index: number, updates: Partial<NewAgentInput>) {
    setAiAgents((agents) => agents.map((a, i) => (i === index ? { ...a, ...updates } : a)))
  }

  function removeAiAgent(index: number) {
    setAiAgents((agents) => agents.filter((_, i) => i !== index))
  }

  function handleAddNewAgent() {
    if (!newAgentName.trim() || !newAgentRole.trim()) return
    const id = newAgentName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    setNewAgents((prev) => [
      ...prev,
      {
        id,
        name: newAgentName.trim(),
        role: newAgentRole.trim(),
        avatar: '🤖',
        type: 'cron',
      },
    ])
    setNewAgentName('')
    setNewAgentRole('')
    setShowAddAgent(false)
  }

  function removeNewAgent(index: number) {
    setNewAgents((agents) => agents.filter((_, i) => i !== index))
  }

  function toggleAgentSelection(agentId: string) {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }

  async function handleCreate() {
    if (!canCreate) return
    setLoading(true)
    setCreateError(null)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
      }

      if (columnMode === 'preset' && selectedPresetId) {
        body.preset_id = selectedPresetId
      } else if (columnMode === 'ai' && customColumns.length > 0) {
        body.columns = customColumns
      }

      // Existing agents to assign
      if (selectedAgentIds.size > 0) {
        body.assign_agent_ids = Array.from(selectedAgentIds)
      }

      // New agents to create
      if (allNewAgents.length > 0) {
        body.new_agents = allNewAgents
      }

      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (data.workspace) {
        setActiveWorkspace(data.workspace.id)
        refresh()
        onClose()
      } else {
        setCreateError(t('createFailed'))
      }
    } catch (error) {
      console.error('Failed to create workspace:', error)
      setCreateError(t('createFailed'))
    } finally {
      setLoading(false)
    }
  }

  const AI_EXAMPLES = AI_EXAMPLE_KEYS.map((key) => ({
    label: t(`examples.${key}.label`),
    value: t(`examples.${key}.prompt`),
  }))

  const content = (
    <>
      <div className="space-y-5">
        {/* Name & Description */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="workspace-name" className="text-sm text-muted mb-1 block">
              {t('name')}
            </label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="workspace-description" className="text-sm text-muted mb-1 block">
              {t('description')}
            </label>
            <Input
              id="workspace-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
            />
          </div>
        </div>

        {/* Column Mode Toggle */}
        <div>
          <p className="text-sm text-muted mb-2">{t('columns')}</p>
          <div className="flex gap-1 mb-3">
            <Button
              variant={columnMode === 'preset' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setColumnMode('preset')}
              aria-pressed={columnMode === 'preset'}
              className="text-xs"
            >
              {t('modePreset')}
            </Button>
            <Button
              variant={columnMode === 'ai' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setColumnMode('ai')}
              aria-pressed={columnMode === 'ai'}
              className="text-xs"
            >
              {t('modeAi')}
            </Button>
          </div>

          {/* Preset Grid */}
          {columnMode === 'preset' && (
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.id}
                  variant="ghost"
                  size="md"
                  onClick={() => setSelectedPresetId(preset.id)}
                  className={`p-3 border rounded-lg text-left text-sm transition-colors h-auto flex-col items-start ${
                    selectedPresetId === preset.id
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:bg-background'
                  }`}
                >
                  <div className="font-medium flex items-center gap-1.5">
                    <span>{preset.icon}</span>
                    <span>{preset.name}</span>
                  </div>
                  <div className="text-xs text-muted mt-1">
                    {preset.columns.map((c) => c.label).join(' → ')}
                  </div>
                </Button>
              ))}
            </div>
          )}

          {/* AI Generation */}
          {columnMode === 'ai' && (
            <div className="space-y-3">
              {generating ? (
                <div
                  role="status"
                  className="flex flex-col items-center justify-center py-8 space-y-3"
                >
                  <Loader2 size={24} aria-hidden className="animate-spin text-muted" />
                  <p className="text-muted text-sm">{t('generating')}</p>
                </div>
              ) : customColumns.length === 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {AI_EXAMPLES.map((ex) => (
                      <Button
                        key={ex.label}
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setAiPrompt(ex.value)
                          handleGenerate(ex.value)
                        }}
                        className="text-left p-2 justify-start h-auto text-xs"
                      >
                        {ex.label}
                      </Button>
                    ))}
                  </div>
                  <div>
                    <label htmlFor="workspace-ai-prompt" className="text-xs text-muted mb-1 block">
                      {t('describeCase')}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="workspace-ai-prompt"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder={t('promptPlaceholder')}
                        onKeyDown={(e) => e.key === 'Enter' && handleGenerate(aiPrompt)}
                        className="flex-1"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleGenerate(aiPrompt)}
                        disabled={!aiPrompt || aiPrompt.length < 3}
                      >
                        {t('generate')}
                      </Button>
                    </div>
                    {generateError && (
                      <p role="alert" className="text-xs text-alert mt-2">
                        {generateError}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Editable columns */}
                  <div className="space-y-1.5">
                    {customColumns.map((col, i) => (
                      <div
                        key={`${col.slug}-${i}`}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border ${
                          col.is_initial_state
                            ? 'border-accent/50 bg-accent/10'
                            : col.is_done_state
                              ? 'border-ok/50 bg-ok/15'
                              : 'border-border bg-card'
                        }`}
                      >
                        <Input
                          className="w-8 text-center bg-transparent border-none outline-hidden px-0 py-0 rounded-none"
                          value={col.icon}
                          aria-label={t('columnIcon')}
                          onChange={(e) => updateColumn(i, { icon: e.target.value })}
                        />
                        <Input
                          className="flex-1 bg-transparent border-none outline-hidden text-foreground text-sm px-0 py-0 rounded-none"
                          value={col.label}
                          aria-label={t('columnName')}
                          onChange={(e) => {
                            const label = e.target.value
                            const slug = label
                              .toUpperCase()
                              .normalize('NFD')
                              .replace(/[\u0300-\u036f]/g, '')
                              .replace(/[^A-Z0-9]+/g, '_')
                              .replace(/^_|_$/g, '')
                            updateColumn(i, { label, slug })
                          }}
                        />
                        {col.is_initial_state && (
                          <span className="text-xs text-accent shrink-0">{t('initial')}</span>
                        )}
                        {col.is_done_state && (
                          <span className="text-xs text-ok shrink-0">{t('final')}</span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeColumn(i)}
                          className="text-muted hover:text-alert transition-colors shrink-0 p-0 h-auto"
                          disabled={customColumns.length <= 2}
                          aria-label={t('removeColumn', { label: col.label })}
                        >
                          <X size={14} aria-hidden />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={addColumn}
                      className="text-xs text-muted hover:text-accent p-0 h-auto"
                    >
                      <Plus size={12} aria-hidden className="mr-1" />
                      {t('addColumn')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCustomColumns([])
                        setAiAgents([])
                      }}
                      className="text-xs text-muted hover:text-accent p-0 h-auto"
                    >
                      {t('regenerate')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Agents Section */}
        <div>
          <p className="text-sm text-muted mb-2">{t('agents')}</p>

          {/* AI-suggested agents */}
          {aiAgents.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted mb-1.5">{t('aiSuggested')}</p>
              <div className="space-y-1.5">
                {aiAgents.map((agent, i) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-accent/5 border border-accent/20 rounded-md text-sm"
                  >
                    <Input
                      className="w-7 text-center bg-transparent border-none outline-hidden px-0 py-0 text-base"
                      value={agent.avatar}
                      aria-label={t('agentAvatar', { name: agent.name })}
                      onChange={(e) => updateAiAgent(i, { avatar: e.target.value })}
                    />
                    <Input
                      className="flex-1 bg-transparent border-none outline-hidden text-sm font-medium px-0 py-0 rounded-none"
                      value={agent.name}
                      aria-label={t('agentNameAria')}
                      onChange={(e) => {
                        const agentName = e.target.value
                        const id = agentName
                          .toLowerCase()
                          .normalize('NFD')
                          .replace(/[\u0300-\u036f]/g, '')
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-|-$/g, '')
                        updateAiAgent(i, { name: agentName, id })
                      }}
                    />
                    <span className="text-xs text-muted truncate max-w-[150px]">{agent.role}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAiAgent(i)}
                      className="text-muted hover:text-alert p-0 h-auto shrink-0"
                      aria-label={t('removeAgent', { name: agent.name })}
                    >
                      <X size={14} aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing agents */}
          {existingAgents.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted mb-1.5">{t('existingAgents')}</p>
              <div className="flex flex-wrap gap-1.5">
                {existingAgents.map((agent) => (
                  <Button
                    key={agent.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleAgentSelection(agent.id)}
                    aria-pressed={selectedAgentIds.has(agent.id)}
                    className={`text-xs border rounded-md px-2 py-1 h-auto ${
                      selectedAgentIds.has(agent.id)
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-muted'
                    }`}
                  >
                    {agent.avatar} {agent.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Manually added agents */}
          {newAgents.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted mb-1.5">{t('newAgents')}</p>
              <div className="space-y-1.5">
                {newAgents.map((agent, i) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm"
                  >
                    <span>{agent.avatar}</span>
                    <span className="font-medium">{agent.name}</span>
                    <span className="text-xs text-muted truncate flex-1">{agent.role}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeNewAgent(i)}
                      className="text-muted hover:text-alert p-0 h-auto shrink-0"
                      aria-label={t('removeAgent', { name: agent.name })}
                    >
                      <X size={14} aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add agent inline */}
          {showAddAgent ? (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder={t('agentNamePlaceholder')}
                  aria-label={t('agentNamePlaceholder')}
                  className="text-sm mb-1"
                  autoFocus
                />
                <Input
                  value={newAgentRole}
                  onChange={(e) => setNewAgentRole(e.target.value)}
                  placeholder={t('agentRolePlaceholder')}
                  aria-label={t('agentRolePlaceholder')}
                  className="text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNewAgent()}
                />
              </div>
              <div className="flex gap-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAddNewAgent}
                  disabled={!newAgentName.trim() || !newAgentRole.trim()}
                >
                  {t('add')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddAgent(false)}
                  aria-label={t('cancelAddAgent')}
                >
                  <X size={14} aria-hidden />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddAgent(true)}
              className="text-xs text-muted hover:text-accent p-0 h-auto"
            >
              <Plus size={12} aria-hidden className="mr-1" />
              {t('addAgent')}
            </Button>
          )}
        </div>
      </div>
    </>
  )

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-xl">
          <h2 className="text-lg font-bold mb-4">{t('title')}</h2>
          {content}
          {createError && (
            <p role="alert" className="text-sm text-alert mt-4">
              {createError}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={!canCreate || loading}
            >
              {loading ? t('creating') : t('create')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Modal open onClose={onClose} size="full" aria-labelledby="create-workspace-title">
      <ModalHeader>
        <h2 id="create-workspace-title" className="text-lg font-bold">
          {t('title')}
        </h2>
      </ModalHeader>
      <ModalBody>
        {content}
        {createError && (
          <p role="alert" className="text-sm text-alert mt-4">
            {createError}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {tc('cancel')}
        </Button>
        <Button variant="primary" size="sm" onClick={handleCreate} disabled={!canCreate || loading}>
          {loading ? t('creating') : t('create')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
