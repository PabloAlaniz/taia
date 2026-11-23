'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Project } from '@taia/types'
import { Button } from '@/components/atoms'
import { ConfirmDialog } from '@/components/molecules/confirm-dialog'
import { api } from '@/lib/api'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Deleting the project, behind the same confirm the old settings list used. */
export function DeleteProject({ project, onDeleted }: { project: Project; onDeleted: () => void }) {
  const t = useTranslations('settingsProjects')
  const tCommon = useTranslations('common')
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await api.projects.delete(project.id)
      setConfirming(false)
      onDeleted()
    } catch (e) {
      setError(t('errors.delete', { error: errorText(e) }))
    }
    setDeleting(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-muted flex-1 min-w-48">{t('deleteHint')}</p>
      <Button
        variant="secondary"
        size="md"
        onClick={() => {
          setError(null)
          setConfirming(true)
        }}
        disabled={deleting}
      >
        {deleting ? t('deleting') : t('confirmDelete.action')}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t('confirmDelete.title', { name: project.name })}
        body={t('confirmDelete.body')}
        confirmLabel={t('confirmDelete.action')}
        cancelLabel={tCommon('cancel')}
        destructive
        busy={deleting}
        error={error}
        onConfirm={handleDelete}
        onCancel={() => {
          setConfirming(false)
          setError(null)
        }}
      />
    </div>
  )
}
