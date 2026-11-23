'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { DiffResult, Worktree } from '@taia/types'
import { Button, WorktreeBadge } from '../atoms'
import { Modal, ModalBody, ModalFooter, ModalHeader } from '../molecules/modal'
import { DiffViewer } from './diff-viewer'
import { api } from '../../lib/api'
import { announceWaitingChanged } from '../../lib/use-shell-signals'

const TERMINAL = ['merged', 'failed', 'cleanup']
const FILE_PREVIEW_LIMIT = 8

/** Window event: open this task's merge review (full diff, then confirm). */
export const REVIEW_MERGE = 'taia:review-merge'

type Confirming = 'merge' | 'discard' | null
type Outcome = { kind: 'success' | 'error'; message: string } | null

function errorText(data: unknown, fallback: string): string {
  const err = (data as { error?: unknown } | null)?.error
  return typeof err === 'string' && err ? err : fallback
}

export function WorktreePanel({ taskId }: { taskId: string }) {
  const t = useTranslations('worktree')
  const [worktree, setWorktree] = useState<Worktree | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [diffError, setDiffError] = useState(false)
  const [showDiff, setShowDiff] = useState(false)

  useEffect(() => {
    api.worktrees
      .list(taskId)
      .then((data) => {
        const live = (data.worktrees || []).find((w) => !TERMINAL.includes(w.status))
        setWorktree(live || null)
      })
      .catch(() => setWorktree(null))
  }, [taskId])

  const loadDiff = (wt: Worktree, thenShow = false) => {
    setDiff(null)
    setDiffError(false)
    api.worktrees
      .diff(wt.id)
      .then((data) => {
        if (data.ok && data.diff) {
          setDiff(data.diff)
          if (thenShow) setShowDiff(true)
        } else setDiffError(true)
      })
      .catch(() => setDiffError(true))
  }

  // The merge dialog shows what is about to land, so it loads the diff fresh.
  // "Review" opens the full diff first; closing it leaves the confirmation.
  const openMerge = (review = false) => {
    if (!worktree) return
    setConfirming('merge')
    loadDiff(worktree, review)
  }

  // "Revisar y mergear" (board strip or the task's waiting band) lands here.
  useEffect(() => {
    if (worktree?.status !== 'reviewing') return
    const open = () => openMerge(true)
    if (new URLSearchParams(window.location.search).get('review') === 'merge') open()
    window.addEventListener(REVIEW_MERGE, open)
    return () => window.removeEventListener(REVIEW_MERGE, open)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-bind only when the worktree changes
  }, [worktree?.id, worktree?.status])

  const create = async () => {
    setBusy(true)
    setOutcome(null)
    try {
      const data = await api.worktrees.create({ task_id: taskId })
      if (data.ok && data.worktree) setWorktree(data.worktree)
      else setOutcome({ kind: 'error', message: errorText(data, t('errors.create')) })
    } catch {
      setOutcome({ kind: 'error', message: t('errors.network') })
    } finally {
      setBusy(false)
    }
  }

  const run = async (action: 'review' | 'merge' | 'abort') => {
    if (!worktree) return
    setBusy(true)
    setOutcome(null)
    try {
      const data = await api.worktrees.action(worktree.id, action)
      if (!data.ok || !data.worktree) {
        setOutcome({ kind: 'error', message: errorText(data, t(`errors.${action}`)) })
        return
      }
      const next = data.worktree
      announceWaitingChanged()
      if (action === 'merge' && next.status === 'merged') {
        setOutcome({ kind: 'success', message: t('merged', { base: worktree.base_branch }) })
      } else if (action === 'abort') {
        setOutcome({ kind: 'success', message: t('discarded') })
      } else if (next.status === 'failed') {
        setOutcome({ kind: 'error', message: next.error_message || t(`errors.${action}`) })
      }
      setWorktree(TERMINAL.includes(next.status) ? null : next)
    } catch {
      setOutcome({ kind: 'error', message: t('errors.network') })
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  const stats = diff?.stats ?? worktree?.diff_stats

  return (
    <div id="worktree" className="scroll-mt-4">
      <h3 className="text-xs font-medium text-muted mb-2">{t('title')}</h3>

      {!worktree ? (
        <Button variant="primary" size="sm" onClick={create} disabled={busy}>
          {busy ? t('creating') : t('create')}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 min-w-0">
            <WorktreeBadge status={worktree.status} />
            <span className="text-xs text-muted truncate" title={worktree.branch_name}>
              {worktree.branch_name}
            </span>
          </div>

          {worktree.diff_stats && (
            <p className="text-xs text-muted tabular-nums font-mono">
              {t('filesChanged', { count: worktree.diff_stats.files_changed })}
              <span className="text-ok ml-1.5">+{worktree.diff_stats.insertions}</span>
              <span className="text-alert ml-1">−{worktree.diff_stats.deletions}</span>
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {worktree.status === 'active' && (
              <Button variant="secondary" size="xs" onClick={() => run('review')} disabled={busy}>
                {t('review')}
              </Button>
            )}
            {worktree.status === 'reviewing' && (
              <Button variant="primary" size="xs" onClick={() => openMerge()} disabled={busy}>
                {t('merge')}
              </Button>
            )}
            {['active', 'reviewing'].includes(worktree.status) && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setConfirming('discard')}
                disabled={busy}
              >
                {t('discard')}
              </Button>
            )}
          </div>

          {worktree.status === 'active' && (
            <p className="text-xs text-muted">{t('mergeNeedsReview')}</p>
          )}
          {worktree.error_message && <p className="text-xs text-alert">{worktree.error_message}</p>}
        </div>
      )}

      {outcome && (
        <p
          role={outcome.kind === 'error' ? 'alert' : 'status'}
          className={outcome.kind === 'error' ? 'mt-2 text-xs text-alert' : 'mt-2 text-xs text-ok'}
        >
          {outcome.message}
        </p>
      )}

      {worktree && (
        <Modal
          open={confirming === 'merge' && !showDiff}
          onClose={() => !busy && setConfirming(null)}
          size="lg"
          aria-labelledby="worktree-merge-title"
        >
          <ModalHeader>
            <h2 id="worktree-merge-title" className="text-sm font-semibold">
              {t('confirmMerge.title', { base: worktree.base_branch })}
            </h2>
            <p className="text-xs text-muted mt-1">
              {t.rich('confirmMerge.body', {
                branch: worktree.branch_name,
                base: worktree.base_branch,
                code: (chunk) => <code className="font-mono text-foreground">{chunk}</code>,
              })}
            </p>
          </ModalHeader>
          <ModalBody className="space-y-3">
            {!diff && !diffError && <p className="text-xs text-muted">{t('loadingDiff')}</p>}
            {diffError && (
              <div role="alert" className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-alert">{t('errors.diff')}</p>
                <Button variant="secondary" size="xs" onClick={() => loadDiff(worktree)}>
                  {t('retryDiff')}
                </Button>
              </div>
            )}
            {stats && (
              <p className="text-sm tabular-nums">
                {t('filesChanged', { count: stats.files_changed })}
                <span className="text-ok ml-2">+{stats.insertions}</span>
                <span className="text-alert ml-1">−{stats.deletions}</span>
              </p>
            )}
            {diff && diff.stats.files.length > 0 && (
              <ul className="text-xs font-mono space-y-1">
                {diff.stats.files.slice(0, FILE_PREVIEW_LIMIT).map((f) => (
                  <li key={f.path} className="flex gap-3 min-w-0">
                    <span className="truncate flex-1" title={f.path}>
                      {f.path}
                    </span>
                    <span className="tabular-nums text-ok">+{f.insertions}</span>
                    <span className="tabular-nums text-alert">−{f.deletions}</span>
                  </li>
                ))}
                {diff.stats.files.length > FILE_PREVIEW_LIMIT && (
                  <li className="text-muted font-sans">
                    {t('moreFiles', { count: diff.stats.files.length - FILE_PREVIEW_LIMIT })}
                  </li>
                )}
              </ul>
            )}
            {diff && (
              <Button variant="secondary" size="xs" onClick={() => setShowDiff(true)}>
                {t('viewDiff')}
              </Button>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(null)} disabled={busy}>
              {t('cancel')}
            </Button>
            {/* Without the diff, merging is still possible but never the default. */}
            <Button
              variant={diffError ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => run('merge')}
              disabled={busy || (!diff && !diffError)}
            >
              {busy
                ? t('merging')
                : diffError
                  ? t('confirmMerge.blind', { base: worktree.base_branch })
                  : t('confirmMerge.action', { base: worktree.base_branch })}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {worktree && (
        <Modal
          open={confirming === 'discard'}
          onClose={() => !busy && setConfirming(null)}
          size="md"
          aria-labelledby="worktree-discard-title"
        >
          <ModalHeader>
            <h2 id="worktree-discard-title" className="text-sm font-semibold">
              {t('confirmDiscard.title')}
            </h2>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm">
              {t.rich('confirmDiscard.body', {
                branch: worktree.branch_name,
                code: (chunk) => <code className="font-mono">{chunk}</code>,
              })}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(null)} disabled={busy}>
              {t('cancel')}
            </Button>
            <Button variant="danger" size="sm" onClick={() => run('abort')} disabled={busy}>
              {busy ? t('discarding') : t('confirmDiscard.action')}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {showDiff && diff && <DiffViewer diff={diff} onClose={() => setShowDiff(false)} />}
    </div>
  )
}
