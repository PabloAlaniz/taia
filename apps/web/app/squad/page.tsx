'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Bot, Plus } from 'lucide-react'
import { Alert, Button } from '@/components/atoms'
import { ConfirmDialog, EmptyState, RackSection, SkeletonCard } from '@/components/molecules'
import { PageHeader } from '@/components/molecules/page-header'
import { RuntimeNotice } from '@/components/organisms/runtime-notice'
import { AddAgentModal } from '@/client/features/squad/AddAgentModal'
import { EditAgentModal } from '@/client/features/squad/EditAgentModal'
import { SquadAgentCard } from '@/client/features/squad/SquadAgentCard'
import type { SquadMember } from '@/client/features/squad/types'
import { useResource } from '@/lib/use-resource'

async function loadSquad(): Promise<SquadMember[]> {
  const res = await fetch('/api/agents?detail=full')
  if (!res.ok) throw new Error('load')
  const data = (await res.json()) as { agents?: SquadMember[] }
  return data.agents ?? []
}

export default function SquadPage() {
  const tp = useTranslations('pageTitles')
  const t = useTranslations('squad')
  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useResource('/api/agents?detail=full', loadSquad, { refreshMs: 30_000 })
  const squad = data ?? []
  const agents = squad.filter((m) => m.type !== 'human')
  const people = squad.filter((m) => m.type === 'human')

  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleting = squad.find((m) => m.id === deletingId)

  const confirmDelete = async () => {
    if (!deletingId) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/agents/${deletingId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setDeletingId(null)
      reload()
    } catch {
      setDeleteError(t('deleteFailed'))
    } finally {
      setDeleteBusy(false)
    }
  }

  const rows = (members: SquadMember[]) =>
    members.map((member) => (
      <SquadAgentCard
        key={member.id}
        member={member}
        onUpdate={reload}
        onEdit={setEditingId}
        onDelete={(id) => {
          setDeleteError(null)
          setDeletingId(id)
        }}
      />
    ))

  return (
    <div className="min-h-full">
      <PageHeader width="medium" title={tp('agents')}>
        <Button
          variant="primary"
          size="md"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5"
        >
          <Plus size={15} aria-hidden="true" />
          {t('add')}
        </Button>
      </PageHeader>

      <div className="px-4 md:px-6 pt-4 pb-10 max-w-4xl mx-auto space-y-4">
        <p className="text-sm text-muted max-w-prose">{t('intro')}</p>
        <RuntimeNotice feature="cron" />
        {loadError && <Alert variant="error">{t('loadFailed')}</Alert>}

        <RackSection
          title={t('agentsSection')}
          count={loading ? undefined : agents.length}
          aside={
            agents.length > 0 ? (
              <span>
                {t('working', { count: agents.filter((a) => a.tasks.inProgress > 0).length })}
              </span>
            ) : undefined
          }
        >
          {loading ? (
            [1, 2, 3].map((i) => <SkeletonCard key={i} height="h-14" />)
          ) : agents.length === 0 ? (
            <EmptyState
              onRack
              icon={<Bot size={22} aria-hidden="true" />}
              title={t('noAgents')}
              description={t('noAgentsHint')}
              action={
                <Button variant="secondary" size="md" onClick={() => setShowAdd(true)}>
                  {t('add')}
                </Button>
              }
            />
          ) : (
            rows(agents)
          )}
        </RackSection>

        {!loading && (
          <RackSection title={t('peopleSection')} count={people.length}>
            {people.length === 0 ? (
              <EmptyState onRack title={t('noPeople')} description={t('noPeopleHint')} />
            ) : (
              rows(people)
            )}
          </RackSection>
        )}
      </div>

      {showAdd && (
        <AddAgentModal
          onClose={() => setShowAdd(false)}
          onAdd={() => {
            reload()
            setShowAdd(false)
          }}
        />
      )}

      {editingId && (
        <EditAgentModal
          agent={squad.find((a) => a.id === editingId) as never}
          onClose={() => setEditingId(null)}
          onSave={() => {
            reload()
            setEditingId(null)
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title={t('confirmDelete.title', { name: deleting?.name ?? '' })}
        body={
          deleting?.type === 'human' ? t('confirmDelete.bodyPerson') : t('confirmDelete.bodyAgent')
        }
        confirmLabel={t('confirmDelete.action')}
        cancelLabel={t('cancel')}
        destructive
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  )
}
