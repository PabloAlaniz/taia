'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button, Input, ParticipantMark } from '@/components/atoms'
import { Card } from '@/components/molecules/card'
import { ConfirmDialog } from '@/components/molecules/confirm-dialog'
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
  const t = useTranslations('settingsTeam')
  const tCommon = useTranslations('common')
  const tc = useTranslations('settingsCommon')
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
  const [confirmMember, setConfirmMember] = useState<HumanAgent | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    fetchMembers()
    // Loads once on mount; fetchMembers only reads t for its error text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchMembers() {
    try {
      const res = await fetch('/api/agents')
      const data = await res.json()
      if (data.ok) {
        setMembers(data.agents.filter((a: { type?: string }) => a.type === 'human'))
      }
    } catch {
      setError(t('errors.load'))
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
      setError(t('errors.required'))
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
          setError(t('errors.save', { error: String(data.error) }))
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
          setError(t('errors.save', { error: String(data.error) }))
          setSaving(false)
          return
        }
      }

      resetForm()
      await fetchMembers()
    } catch (e) {
      setError(t('errors.save', { error: e instanceof Error ? e.message : String(e) }))
    }
    setSaving(false)
  }

  async function handleDelete(member: HumanAgent) {
    setDeletingId(member.id)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/agents/${member.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) {
        setDeleteError(t('errors.delete', { name: member.name, error: String(data.error) }))
      } else {
        setConfirmMember(null)
        await fetchMembers()
      }
    } catch (e) {
      setDeleteError(
        t('errors.delete', {
          name: member.name,
          error: e instanceof Error ? e.message : String(e),
        }),
      )
    }
    setDeletingId(null)
  }

  const inputClass =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-hidden focus:border-accent'

  if (loading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <span className="text-sm text-muted" role="status">
          {tCommon('loading')}
        </span>
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
              <h2 className="font-semibold">{t('listTitle')}</h2>
              <p className="text-sm text-muted mt-1">{t('listDesc')}</p>
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
                <Plus className="w-4 h-4" aria-hidden="true" />
                {t('add')}
              </Button>
            )}
          </div>

          {members.length === 0 && !showForm ? (
            <div className="p-8 text-center text-sm text-muted">{t('empty')}</div>
          ) : (
            <div className="divide-y divide-border">
              {members.map((member) => (
                <div key={member.id} className="p-4 flex items-center gap-3">
                  <ParticipantMark agent={{ type: 'human' }} className="h-8" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{member.name}</div>
                    <div className="text-xs text-muted truncate">
                      {member.role || t('noRole')} · <code className="text-2xs">{member.id}</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="xs" onClick={() => startEdit(member)}>
                      {tCommon('edit')}
                    </Button>
                    <Button
                      variant="danger"
                      size="xs"
                      onClick={() => {
                        setDeleteError(null)
                        setConfirmMember(member)
                      }}
                      disabled={deletingId === member.id}
                    >
                      {deletingId === member.id ? t('deleting') : tCommon('delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Add/Edit Form */}
        {showForm && (
          <SectionCard
            title={
              editingId
                ? t('editTitle', {
                    name: members.find((m) => m.id === editingId)?.name ?? editingId,
                  })
                : t('newTitle')
            }
          >
            <div>
              <label htmlFor="team-member-id" className="text-xs text-muted block mb-1">
                {t('idLabel')} *
              </label>
              <Input
                id="team-member-id"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                placeholder={t('idPlaceholder')}
                disabled={!!editingId}
                className={`${inputClass} ${editingId ? 'opacity-50' : ''}`}
              />
              <p className="text-xs text-muted mt-1">{t('idHelp')}</p>
            </div>

            <div>
              <label htmlFor="team-member-name" className="text-xs text-muted block mb-1">
                {t('nameLabel')} *
              </label>
              <Input
                id="team-member-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('namePlaceholder')}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="team-member-role" className="text-xs text-muted block mb-1">
                {t('roleLabel')}
              </label>
              <Input
                id="team-member-role"
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                placeholder={t('rolePlaceholder')}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="team-member-avatar" className="text-xs text-muted block mb-1">
                {t('avatarLabel')}
              </label>
              <Input
                id="team-member-avatar"
                value={formAvatar}
                onChange={(e) => setFormAvatar(e.target.value)}
                placeholder="👤"
                className={inputClass}
              />
            </div>

            {error && (
              <div role="alert" className="text-sm text-alert">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 justify-end">
              <Button variant="ghost" size="lg" onClick={resetForm}>
                {tCommon('cancel')}
              </Button>
              <Button variant="primary" size="lg" onClick={handleSave} disabled={saving}>
                {saving ? tc('saving') : editingId ? t('update') : t('create')}
              </Button>
            </div>
          </SectionCard>
        )}

        <ConfirmDialog
          open={confirmMember !== null}
          title={t('confirmDelete.title', { name: confirmMember?.name ?? '' })}
          body={t('confirmDelete.body', { name: confirmMember?.name ?? '' })}
          confirmLabel={t('confirmDelete.action')}
          cancelLabel={tCommon('cancel')}
          destructive
          busy={deletingId !== null}
          error={deleteError}
          onConfirm={() => confirmMember && handleDelete(confirmMember)}
          onCancel={() => {
            setConfirmMember(null)
            setDeleteError(null)
          }}
        />
      </div>
    </div>
  )
}
