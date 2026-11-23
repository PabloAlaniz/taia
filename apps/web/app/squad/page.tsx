'use client'

import { useTranslations } from 'next-intl'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Bot, Plus, Users } from 'lucide-react'
import { Alert, Button } from '@/components/atoms'
import { ConfirmDialog, EmptyState, RackSection, SkeletonCard } from '@/components/molecules'
import { PageHeader } from '@/components/molecules/page-header'
import { RuntimeNotice } from '@/components/organisms/runtime-notice'
import { AddAgentModal } from '@/client/features/squad/AddAgentModal'
import { AddPersonModal } from '@/client/features/squad/AddPersonModal'
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
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense>
      <Squad />
    </Suspense>
  )
}

function Squad() {
  // ?member=<id> (from the "/" palette) opens and focuses that row.
  const focusMember = useSearchParams().get('member')
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
  const [showAddPerson, setShowAddPerson] = useState(false)
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
        focused={member.id === focusMember}
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
      {/* Each rack carries its own add action, so agents and people are added alike. */}
      <PageHeader width="medium" title={tp('team')} />

      <div className="px-4 md:px-6 pt-4 pb-10 max-w-4xl mx-auto space-y-4">
        <p className="text-sm text-muted max-w-prose">{t('intro')}</p>
        <RuntimeNotice feature="cron" />
        {loadError && <Alert variant="error">{t('loadFailed')}</Alert>}

        <RackSection
          title={t('agentsSection')}
          count={loading ? undefined : agents.length}
          aside={
            <>
              {agents.length > 0 && (
                <span>
                  {t('working', { count: agents.filter((a) => a.tasks.inProgress > 0).length })}
                </span>
              )}
              <RackAction onClick={() => setShowAdd(true)}>{t('add')}</RackAction>
            </>
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
          <RackSection
            title={t('peopleSection')}
            count={people.length}
            aside={<RackAction onClick={() => setShowAddPerson(true)}>{t('addPerson')}</RackAction>}
          >
            {people.length === 0 ? (
              <EmptyState
                onRack
                icon={<Users size={22} aria-hidden="true" />}
                title={t('noPeople')}
                description={t('noPeopleHint')}
                action={
                  <Button variant="secondary" size="md" onClick={() => setShowAddPerson(true)}>
                    {t('addPerson')}
                  </Button>
                }
              />
            ) : (
              rows(people)
            )}
          </RackSection>
        )}
      </div>

      {showAdd && (
        <AddAgentModal
          takenIds={squad.map((m) => m.id)}
          onClose={() => setShowAdd(false)}
          onAdd={() => {
            reload()
            setShowAdd(false)
          }}
        />
      )}

      {showAddPerson && (
        <AddPersonModal
          takenIds={squad.map((m) => m.id)}
          onClose={() => setShowAddPerson(false)}
          onAdd={() => {
            reload()
            setShowAddPerson(false)
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
        body={t('confirmDelete.body')}
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

/** The add action in a rack's header: outlined on graphite, white focus ring. */
function RackAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 border-rack-line text-on-rack hover:bg-rack-line hover:text-rack-heading focus-visible:ring-white focus-visible:ring-offset-rack"
    >
      <Plus size={14} aria-hidden="true" />
      {children}
    </Button>
  )
}
