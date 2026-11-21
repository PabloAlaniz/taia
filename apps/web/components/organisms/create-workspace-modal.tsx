'use client'

import { useState, useEffect } from 'react'
import { Button, Input } from '../atoms'
import { Modal, ModalHeader, ModalBody, ModalFooter } from './modal'
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
    try {
      type GeneratedSetup = {
        workspace: { name?: string; columns: ColumnInput[] }
        agents: Array<{ id: string; name: string; role?: string; avatar?: string; type?: string }>
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
      }
    } catch (e) {
      console.error('AI generation failed:', e instanceof Error ? e.message : String(e))
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
        label: 'Nueva columna',
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
      }
    } catch (error) {
      console.error('Failed to create workspace:', error)
    } finally {
      setLoading(false)
    }
  }

  const AI_EXAMPLES = [
    {
      label: 'Desarrollo de software',
      value:
        'Quiero gestionar un equipo de desarrollo de software con agentes que revisen codigo, escriban tests, y hagan deploy',
    },
    {
      label: 'Marketing de contenidos',
      value:
        'Necesito agentes para crear y gestionar contenido de marketing: redaccion, diseno, publicacion en redes sociales',
    },
    {
      label: 'Escritura y editorial',
      value:
        'Quiero gestionar un flujo editorial: investigacion, borradores, edicion, revision y publicacion',
    },
    {
      label: 'Pipeline de ventas',
      value:
        'Necesito gestionar un pipeline de ventas: prospeccion, contacto, propuestas, negociacion y cierre',
    },
  ]

  const content = (
    <>
      <div className="space-y-5">
        {/* Name & Description */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted mb-1 block">Nombre</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej: Marketing, Escritura…"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Descripcion (opcional)</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripcion del workspace"
            />
          </div>
        </div>

        {/* Column Mode Toggle */}
        <div>
          <label className="text-sm text-muted mb-2 block">Columnas</label>
          <div className="flex gap-1 mb-3">
            <Button
              variant={columnMode === 'preset' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setColumnMode('preset')}
              className="text-xs"
            >
              Presets
            </Button>
            <Button
              variant={columnMode === 'ai' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setColumnMode('ai')}
              className="text-xs"
            >
              Generar con IA
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
                <div className="flex flex-col items-center justify-center py-8 space-y-3">
                  <div className="text-3xl animate-pulse">🧠</div>
                  <p className="text-muted text-sm">El agente esta analizando tu necesidad...</p>
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
                    <p className="text-xs text-muted mb-1">O describe tu caso:</p>
                    <div className="flex gap-2">
                      <Input
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="Ej: Quiero gestionar un equipo de QA…"
                        onKeyDown={(e) => e.key === 'Enter' && handleGenerate(aiPrompt)}
                        className="flex-1"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleGenerate(aiPrompt)}
                        disabled={!aiPrompt || aiPrompt.length < 3}
                      >
                        Generar
                      </Button>
                    </div>
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
                            ? 'border-blue-500/50 bg-blue-500/10'
                            : col.is_done_state
                              ? 'border-green-500/50 bg-green-500/10'
                              : 'border-border bg-card'
                        }`}
                      >
                        <Input
                          className="w-8 text-center bg-transparent border-none outline-hidden px-0 py-0 rounded-none"
                          value={col.icon}
                          onChange={(e) => updateColumn(i, { icon: e.target.value })}
                        />
                        <Input
                          className="flex-1 bg-transparent border-none outline-hidden text-foreground text-sm px-0 py-0 rounded-none"
                          value={col.label}
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
                          <span className="text-xs text-blue-400 shrink-0">(inicio)</span>
                        )}
                        {col.is_done_state && (
                          <span className="text-xs text-green-400 shrink-0">(final)</span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeColumn(i)}
                          className="text-muted hover:text-red-400 transition-colors shrink-0 p-0 h-auto"
                          disabled={customColumns.length <= 2}
                        >
                          ✕
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
                      + Agregar columna
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
                      Regenerar
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Agents Section */}
        <div>
          <label className="text-sm text-muted mb-2 block">Agentes</label>

          {/* AI-suggested agents */}
          {aiAgents.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted mb-1.5">Sugeridos por IA</p>
              <div className="space-y-1.5">
                {aiAgents.map((agent, i) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-accent/5 border border-accent/20 rounded-md text-sm"
                  >
                    <Input
                      className="w-7 text-center bg-transparent border-none outline-hidden px-0 py-0 text-base"
                      value={agent.avatar}
                      onChange={(e) => updateAiAgent(i, { avatar: e.target.value })}
                    />
                    <Input
                      className="flex-1 bg-transparent border-none outline-hidden text-sm font-medium px-0 py-0 rounded-none"
                      value={agent.name}
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
                      className="text-muted hover:text-red-400 p-0 h-auto shrink-0"
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing agents */}
          {existingAgents.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted mb-1.5">Agentes existentes</p>
              <div className="flex flex-wrap gap-1.5">
                {existingAgents.map((agent) => (
                  <Button
                    key={agent.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleAgentSelection(agent.id)}
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
              <p className="text-xs text-muted mb-1.5">Nuevos agentes</p>
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
                      className="text-muted hover:text-red-400 p-0 h-auto shrink-0"
                    >
                      ✕
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
                  placeholder="Nombre del agente"
                  className="text-sm mb-1"
                  autoFocus
                />
                <Input
                  value={newAgentRole}
                  onChange={(e) => setNewAgentRole(e.target.value)}
                  placeholder="Rol (ej: Revisa codigo y sugiere mejoras)"
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
                  Agregar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowAddAgent(false)}>
                  ✕
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
              + Agregar agente
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
          <h2 className="text-lg font-bold mb-4">Nuevo Workspace</h2>
          {content}
          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={!canCreate || loading}
            >
              {loading ? 'Creando...' : 'Crear Workspace'}
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
          Nuevo Workspace
        </h2>
      </ModalHeader>
      <ModalBody>{content}</ModalBody>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" size="sm" onClick={handleCreate} disabled={!canCreate || loading}>
          {loading ? 'Creando...' : 'Crear Workspace'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
