'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import type { Task } from '@taia/types'
import { cn } from '../../lib/utils'
import { useStore } from '../../lib/store'
import { UNDO_MS, useBoardSignals } from '../../lib/use-board-signals'
import { Button, Kbd, UndoCountdown } from '../atoms'
import { REVIEW_MERGE } from './worktree-panel'

/**
 * On a task that waits on a person, the first thing on the page: why, and the
 * action that resolves it. Same words and the same undo as the board strip.
 */
export function WaitingBand({ task }: { task: Task }) {
  const t = useTranslations('taskCard')
  const tb = useTranslations('waitingBand')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const agents = useStore((s) => s.agents)
  const currentUserId = useStore((s) => s.currentUserId)
  const signals = useBoardSignals([task])
  // Focus follows the decision: to Deshacer once queued, back to Aprobar if undone.
  const [justUndone, setJustUndone] = useState(false)
  const waiting = signals.waiting[task.id]
  // After a decision is sent the band would just vanish; leave a filed line
  // saying what was decided, and keep the keyboard there.
  const queued = useRef<{ decision: 'approved' | 'rejected'; what: string } | null>(null)
  const [filed, setFiled] = useState<{ decision: 'approved' | 'rejected'; what: string } | null>(
    null,
  )
  const filedRef = useRef<HTMLParagraphElement>(null)
  const currentApproval = waiting?.kind === 'approval' ? waiting.approval : null
  const currentPending = currentApproval ? signals.pending[currentApproval.id] : undefined
  useEffect(() => {
    if (currentApproval && currentPending) {
      const input = currentApproval.tool_input ?? {}
      const cmd = ['command', 'cmd', 'path', 'file_path', 'url']
        .map((k) => input[k])
        .find((v) => typeof v === 'string' && v) as string | undefined
      queued.current = {
        decision: currentPending.decision,
        what: cmd ? `${currentApproval.tool_name}: ${cmd}` : currentApproval.tool_name,
      }
    } else if (queued.current && !currentApproval) {
      setFiled(queued.current)
      queued.current = null
    }
  }, [currentApproval, currentPending])
  useEffect(() => {
    if (filed) filedRef.current?.focus()
  }, [filed])

  if (!waiting) {
    if (!filed) return null
    return (
      <p
        ref={filedRef}
        tabIndex={-1}
        role="status"
        className="max-w-3xl mx-auto mt-6 w-[calc(100%-3rem)] rounded-[2px] bg-strip-done px-4 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span
          className={cn('font-semibold', filed.decision === 'approved' ? 'text-ok' : 'text-alert')}
        >
          {filed.decision === 'approved' ? tb('filedApproved') : tb('filedRejected')}
        </span>{' '}
        <code className="font-mono text-xs break-all">{filed.what}</code>
      </p>
    )
  }

  const focus = (id: string) => {
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    ;(el?.querySelector('button, input, textarea') as HTMLElement | null)?.focus({
      preventScroll: true,
    })
    if (el instanceof HTMLInputElement) el.focus({ preventScroll: true })
  }

  const approval = waiting.kind === 'approval' ? waiting.approval : null
  const pending = approval ? signals.pending[approval.id] : undefined
  const subject = approval?.tool_input
    ? (['command', 'cmd', 'path', 'file_path', 'url']
        .map((k) => approval.tool_input?.[k])
        .find((v) => typeof v === 'string' && v) as string | undefined)
    : undefined

  return (
    <section
      data-waiting-band
      aria-label={t('waitingTag')}
      className="relative max-w-3xl mx-auto mt-6 w-[calc(100%-3rem)] rounded-[2px] bg-card shadow-[0_0_0_1px_var(--person),0_6px_14px_rgba(0,0,0,0.18)] pl-5 pr-4 py-3"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[5px] rounded-l-[2px] bg-person"
      />
      <div className="flex items-baseline gap-2">
        <span className="text-xxs font-bold tracking-[0.12em] uppercase bg-person text-on-person px-1.5 rounded-[2px]">
          {t('waitingTag')}
        </span>
        <span className="text-sm text-muted">
          {waiting.kind === 'approval' &&
            t('waitingApproval', {
              time: format.relativeTime(new Date(waiting.approval.created_at), now),
            })}
          {waiting.kind === 'merge' && t('waitingMerge')}
          {waiting.kind === 'clarify' && t('waitingClarify')}
        </span>
      </div>

      {approval && (
        <div className="mt-2">
          <p className="text-sm">
            {t.rich('approvalAsk', {
              agent: agents.find((a) => a.id === approval.agent_id)?.name ?? '—',
              tool: approval.tool_name,
              b: (chunk) => <b className="font-semibold">{chunk}</b>,
            })}
          </p>
          {subject && (
            <code className="block mt-1.5 font-mono text-xs bg-strip px-2 py-1.5 rounded-[2px] whitespace-pre-wrap break-all">
              {subject}
            </code>
          )}
        </div>
      )}
      {waiting.kind === 'merge' && waiting.worktree.diff_stats && (
        <p className="mt-2 text-sm">
          {tb('mergeInto', {
            branch: waiting.worktree.branch_name,
            base: waiting.worktree.base_branch,
            files: waiting.worktree.diff_stats.files_changed,
          })}{' '}
          <span className="font-mono text-xs text-ok">
            +{waiting.worktree.diff_stats.insertions}
          </span>{' '}
          <span className="font-mono text-xs text-alert">
            −{waiting.worktree.diff_stats.deletions}
          </span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {approval && !pending && (
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={!currentUserId}
              // biome-ignore lint/a11y/noAutofocus: returns focus after Deshacer
              autoFocus={justUndone}
              data-decide="approve"
              aria-keyshortcuts="A"
              onClick={() =>
                currentUserId && signals.queueDecision(approval.id, 'approved', currentUserId)
              }
            >
              {t('approve')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!currentUserId}
              data-decide="reject"
              aria-keyshortcuts="X"
              onClick={() =>
                currentUserId && signals.queueDecision(approval.id, 'rejected', currentUserId)
              }
            >
              {t('reject')}
            </Button>
            {currentUserId ? (
              <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted ml-1">
                <Kbd>A</Kbd>
                {tb('keyApprove')}
                <Kbd>X</Kbd>
                {tb('keyReject')}
              </span>
            ) : (
              <p className="basis-full text-xs text-muted">{t('pickUserToDecide')}</p>
            )}
          </>
        )}
        {approval && pending && (
          <div role="status" className="flex items-center gap-2">
            <span
              className={cn(
                'text-sm font-semibold',
                pending.decision === 'approved' ? 'text-ok' : 'text-alert',
              )}
            >
              {pending.decision === 'approved' ? t('approvedPending') : t('rejectedPending')}
            </span>
            <UndoCountdown sendAt={pending.sendAt} total={UNDO_MS} />
            <Button
              variant="secondary"
              size="sm"
              // biome-ignore lint/a11y/noAutofocus: keyboard users get the undo window
              autoFocus
              onClick={() => {
                setJustUndone(true)
                queued.current = null
                signals.undoDecision(approval.id)
              }}
            >
              {t('undo')}
            </Button>
          </div>
        )}
        {approval && signals.decisionErrors[approval.id] && (
          <p role="alert" className="basis-full text-xs text-alert">
            {signals.decisionErrors[approval.id] === 'already_decided'
              ? t('alreadyDecided')
              : t('decideFailed')}
          </p>
        )}
        {waiting.kind === 'merge' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              // Scroll only: focus stays on this button so the dialog returns it here.
              document
                .getElementById('worktree')
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              window.dispatchEvent(new Event(REVIEW_MERGE))
            }}
          >
            {t('reviewAndMerge')}
          </Button>
        )}
        {waiting.kind === 'clarify' && (
          <Button variant="primary" size="sm" onClick={() => focus('task-comment')}>
            {t('answer')}
          </Button>
        )}
      </div>
    </section>
  )
}
