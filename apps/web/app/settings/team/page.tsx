'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import { Button, Input } from '@/components/atoms'
import { Card } from '@/components/molecules/card'
import { PageHeader } from '@/components/molecules/page-header'
import { SectionCard } from '@/components/molecules/section-card'

interface HumanAgent {
  id: string
  name: string
  role?: string
  avatar: string
  type: 'human'
}

export default function TeamSettingsPage() {
  const tp = useTranslations('pageTitles')
  const [members, setMembers] = useState<HumanAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [formId, setFormId] = useState('')
  const [formName, setFormName] = useState('')
  const [formRole, setFormRole] = useState('')
  const [formAvatar, setFormAvatar] = useState('👤')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchMembers()
  }, [])

  async function fetchMembers() {
    try {
      const res = await fetch('/api/agents')
      const data = await res.json()
      if (data.ok) {
        setMembers(data.agents.filter((a: { type?: string }) => a.type === 'human'))
      }
    } catch {
      setError('Error al cargar miembros')
    }
    setLoading(false)
  }

  function resetForm() {
    setFormId('')
    setFormName('')
    setFormRole('')
    setFormAvatar('👤')
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(member: HumanAgent) {
    setEditingId(member.id)
    setFormId(member.id)
    setFormName(member.name)
    setFormRole(member.role || '')
    setFormAvatar(member.avatar)
    setShowForm(true)
    setError('')
  }

  async function handleSave() {
    if (!formId.trim() || !formName.trim()) {
      setError('ID y Nombre son requeridos')
      return
    }

    setSaving(true)
    setError('')

    try {
      if (editingId) {
        // Update existing
        const res = await fetch(`/api/agents/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName,
            role: formRole || undefined,
            avatar: formAvatar,
          }),
        })
        const data = await res.json()
        if (!data.ok) {
          setError(data.error || 'Error al actualizar')
          setSaving(false)
          return
        }
      } else {
        // Create new
        const res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: formId.toLowerCase().replace(/\s+/g, '-'),
            name: formName,
            role: formRole || undefined,
            avatar: formAvatar,
            type: 'human',
          }),
        })
        const data = await res.json()
        if (!data.ok) {
          setError(data.error || 'Error al crear')
          setSaving(false)
          return
        }
      }

      resetForm()
      await fetchMembers()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error || 'Error al eliminar')
      } else {
        await fetchMembers()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setDeletingId(null)
  }

  const inputClass =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-hidden focus:border-accent'

  if (loading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <span className="text-2xl">⏳</span>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <PageHeader width="form" title={tp('team')} backHref="/settings" backLabel={tp('settings')} />

      <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto space-y-8">
        {/* Member List */}
        <Card padding="none" className="rounded-lg">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Miembros del equipo</h2>
              <p className="text-sm text-muted mt-1">
                Miembros humanos que pueden tener tareas asignadas.
              </p>
            </div>
            {!showForm && (
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  resetForm()
                  setShowForm(true)
                }}
              >
                + Agregar
              </Button>
            )}
          </div>

          {members.length === 0 && !showForm ? (
            <div className="p-8 text-center text-sm text-muted">
              No hay miembros humanos. Agrega uno para comenzar.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {members.map((member) => (
                <div key={member.id} className="p-4 flex items-center gap-3">
                  <span className="text-2xl">{member.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{member.name}</div>
                    <div className="text-xs text-muted truncate">
                      {member.role || 'Sin rol'} · <code className="text-2xs">{member.id}</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="xs" onClick={() => startEdit(member)}>
                      Editar
                    </Button>
                    <Button
                      variant="danger"
                      size="xs"
                      onClick={() => handleDelete(member.id)}
                      disabled={deletingId === member.id}
                    >
                      {deletingId === member.id ? '...' : 'Eliminar'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Add/Edit Form */}
        {showForm && (
          <SectionCard title={editingId ? 'Editar miembro' : 'Nuevo miembro'}>
            <div>
              <label className="text-xs text-muted block mb-1">ID *</label>
              <Input
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                placeholder="agent-1"
                disabled={!!editingId}
                className={`${inputClass} ${editingId ? 'opacity-50' : ''}`}
              />
              <p className="text-xs text-muted mt-1">
                Identificador unico (lowercase, sin espacios).
              </p>
            </div>

            <div>
              <label className="text-xs text-muted block mb-1">Nombre *</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Agent 1"
                className={inputClass}
              />
            </div>

            <div>
              <label className="text-xs text-muted block mb-1">Rol</label>
              <Input
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                placeholder="Lead"
                className={inputClass}
              />
            </div>

            <div>
              <label className="text-xs text-muted block mb-1">Avatar</label>
              <Input
                value={formAvatar}
                onChange={(e) => setFormAvatar(e.target.value)}
                placeholder="👤"
                className={inputClass}
              />
            </div>

            {error && <div className="text-sm text-red-500">{error}</div>}

            <div className="flex items-center gap-3 justify-end">
              <Button variant="ghost" size="lg" onClick={resetForm}>
                Cancelar
              </Button>
              <Button variant="primary" size="lg" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
              </Button>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  )
}
