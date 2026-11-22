'use client'

import { useFormatter, useNow, useTranslations } from 'next-intl'
import type { Task } from '@taia/types'
import { cn } from '../../lib/utils'
import { useStore } from '../../lib/store'
import { UNDO_MS, useBoardSignals } from '../../lib/use-board-signals'
import { Button } from '../atoms'

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
  const waiting = signals.waiting[task.id]
  if (!waiting) return null

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
      aria-label={t('waitingTag')}
      className="relative mx-4 md:mx-8 mt-6 rounded-[2px] bg-card shadow-[0_0_0_1px_var(--person),0_6px_14px_rgba(0,0,0,0.18)] pl-5 pr-4 py-3"
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
              onClick={() =>
                currentUserId && signals.queueDecision(approval.id, 'rejected', currentUserId)
              }
            >
              {t('reject')}
            </Button>
            {!currentUserId && (
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
            <span className="text-xs text-muted">{t('sendsIn', { seconds: UNDO_MS / 1000 })}</span>
            <Button variant="secondary" size="sm" onClick={() => signals.undoDecision(approval.id)}>
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
          <Button variant="primary" size="sm" onClick={() => focus('worktree')}>
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
