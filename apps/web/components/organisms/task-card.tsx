'use client'

import { useEffect, useRef, useState, memo } from 'react'
import { useFormatter, useNow, useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Task, Agent } from '@taia/types'
import { cn } from '../../lib/utils'
import { formatUsd, participantKind } from '../../lib/format'
import { UNDO_MS, type ApprovalControls, type WaitingReason } from '../../lib/use-board-signals'
import { useStore } from '../../lib/store'
import { Button, Badge, GitHubIcon, BlockerIcon, UndoCountdown } from '../atoms'
import { Card } from '../molecules'
import { shortTaskId } from '@taia/domain/domain/task/task-id'

interface TaskCardProps {
  task: Task
  agents: Agent[]
  isDragging?: boolean
  isSelected?: boolean
  isAssigning?: boolean
  onSelect?: () => void
  onAssign: (taskId: string, agentId: string) => void
  unresolvedBlockers?: number
  /** USD spent on this task's sessions; undefined when it has none. */
  cost?: number
  /** Set when the strip waits on a person: it is pulled out of the rack. */
  waiting?: WaitingReason
  /** A live runtime session is working on it right now. */
  running?: boolean
  approvals?: ApprovalControls
}

const SYSTEM_TAGS = ['blocked', 'needs-clarification']

/** The command an approval asks about, when the tool input carries one. */
function approvalSubject(input: Record<string, unknown> | null): string | null {
  if (!input) return null
  for (const key of ['command', 'cmd', 'path', 'file_path', 'url']) {
    const value = input[key]
    if (typeof value === 'string' && value) return value
  }
  return null
}

/**
 * A task as a flight strip: one slim line for identity, one for who has it,
 * what they're doing and what it cost. The edge tab says agent or person.
 */
export const TaskCard = memo(function TaskCard({
  task,
  agents,
  isDragging,
  isSelected,
  isAssigning,
  onAssign,
  unresolvedBlockers,
  cost,
  waiting,
  running = false,
  approvals,
}: TaskCardProps) {
  const t = useTranslations('taskCard')
  const format = useFormatter()
  // One clock per minute, so relative times stay current without re-rendering per second.
  const now = useNow({ updateInterval: 60_000 })
  const locale = useLocale()
  const router = useRouter()
  const tagColors = useStore((s) => s.tagColors)
  const [showAssign, setShowAssign] = useState(false)

  const assignee = agents.find((a) => a.id === task.assigned_to)
  const kind = participantKind(assignee)
  const assignable = agents.filter((a) => a.type !== 'orchestrator')
  const done = task.status === 'DONE'
  const tags = Array.from(new Set(task.tags ?? [])).filter((tag) => !SYSTEM_TAGS.includes(tag))
  const blocked = task.tags?.includes('blocked')

  const open = () => router.push(`/task/${task.id}`)

  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  const approvalId = waiting?.kind === 'approval' ? waiting.approval.id : null
  const pendingDecision = approvalId ? approvals?.pending[approvalId] : undefined
  // Focus follows the decision: to Deshacer once queued, back to Aprobar if undone.
  const [justUndone, setJustUndone] = useState(false)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const hadPending = useRef(false)
  useEffect(() => {
    if (pendingDecision) hadPending.current = true
    else if (hadPending.current && !waiting) {
      // Sent: the strip settles back into the rack; keep the keyboard on it.
      hadPending.current = false
      linkRef.current?.focus()
    }
  }, [pendingDecision, waiting])
  const decisionError = approvalId ? approvals?.errors[approvalId] : undefined

  let stateLabel: string | null = null
  if (running) {
    stateLabel = task.started_at
      ? t('runningSince', { time: format.relativeTime(new Date(task.started_at), now) })
      : t('running')
  }

  return (
    // The strip is not one big link: its title is the link, and its actions
    // stay real buttons, so a screen reader hears what's on it. A mouse
    // click anywhere on the strip still opens the task.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the title link is the keyboard path
    <div
      onClick={open}
      data-strip
      data-waiting={waiting ? 'true' : undefined}
      className={cn(
        'group relative rounded-[2px] cursor-pointer transition-[box-shadow,transform,background-color]',
        'pl-3.5 pr-2.5 py-1.5',
        'has-[a[data-strip-link]:focus-visible]:outline-2 has-[a[data-strip-link]:focus-visible]:outline-offset-2 has-[a[data-strip-link]:focus-visible]:outline-accent',
        waiting
          ? '-ml-4 bg-card pb-2.5 shadow-[0_0_0_1px_var(--person),0_6px_14px_rgba(0,0,0,0.35)]'
          : done
            ? 'bg-strip-done shadow-[0_1px_0_rgba(0,0,0,0.3)]'
            : 'bg-strip shadow-[0_1px_0_rgba(0,0,0,0.3)] hover:bg-card',
        blocked && !waiting && 'shadow-[inset_0_0_0_1px_var(--alert),0_1px_0_rgba(0,0,0,0.3)]',
        isDragging && 'rotate-1 shadow-[0_8px_18px_rgba(0,0,0,0.4)]',
        isSelected && 'outline-2 outline-offset-2 outline-accent',
        isAssigning && 'opacity-70',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-[5px] rounded-l-[2px]',
          kind === 'agent' && 'bg-agent',
          kind === 'person' && 'bg-person',
          !kind && 'bg-border',
        )}
      />

      <div className="font-mono text-xxs text-muted tabular-nums leading-none mb-0.5">
        {shortTaskId(task.id)}
      </div>

      {waiting && (
        <div className="flex items-baseline gap-2 mb-1">
          <span className="shrink-0 whitespace-nowrap text-xxs font-bold tracking-[0.12em] uppercase bg-person text-on-person px-1.5 rounded-[2px]">
            {t('waitingTag')}
          </span>
          <span className="text-xs text-muted truncate">
            {waiting.kind === 'approval' &&
              t('waitingApproval', {
                time: format.relativeTime(new Date(waiting.approval.created_at), now),
              })}
            {waiting.kind === 'merge' && t('waitingMerge')}
            {waiting.kind === 'clarify' && t('waitingClarify')}
          </span>
        </div>
      )}

      <div className="flex items-baseline gap-2 min-w-0">
        <h3
          className={cn(
            'text-sm leading-snug line-clamp-2 break-words',
            done ? 'font-medium text-muted line-through decoration-muted/60' : 'font-semibold',
          )}
          title={task.title}
        >
          <Link
            href={`/task/${task.id}`}
            ref={linkRef}
            data-strip-link
            onClick={stop}
            className="text-inherit no-underline focus-visible:outline-none"
          >
            {task.title}
            <span className="sr-only">
              {', '}
              {t('priority', { priority: task.priority })}
            </span>
          </Link>
        </h3>
        {(task.repo_url || task.primary_repo_url) && (
          <a
            href={task.repo_url || task.primary_repo_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            className="ml-auto shrink-0 text-muted hover:text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            aria-label={t('openRepo')}
            title={t('openRepo')}
          >
            <GitHubIcon size={12} />
          </a>
        )}
      </div>

      {waiting?.kind === 'approval' && (
        <p className="text-mid leading-snug mt-1">
          {t.rich('approvalAsk', {
            agent: agents.find((a) => a.id === waiting.approval.agent_id)?.name ?? '—',
            tool: waiting.approval.tool_name,
            b: (chunk) => <b className="font-semibold">{chunk}</b>,
          })}
          {approvalSubject(waiting.approval.tool_input) && (
            <code className="block mt-1 font-mono text-xs bg-strip px-1.5 py-1 rounded-[2px] whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {approvalSubject(waiting.approval.tool_input)}
            </code>
          )}
        </p>
      )}

      <div className="flex items-baseline gap-2 mt-0.5 text-mid text-muted whitespace-nowrap min-w-0">
        {assignee ? (
          <span
            className={cn(
              'font-semibold truncate',
              kind === 'agent' ? 'text-agent-ink' : 'text-person-ink',
            )}
          >
            {assignee.name}
          </span>
        ) : (
          <span>{t('unassigned')}</span>
        )}
        {stateLabel && (
          <span className={cn('truncate', running ? 'text-agent-ink' : 'text-alert font-semibold')}>
            {running && (
              <span
                aria-hidden="true"
                className="inline-block w-1.5 h-1.5 rounded-full bg-agent mr-1.5 align-[1px] ring-2 ring-agent/25 motion-safe:animate-pulse"
              />
            )}
            {stateLabel}
          </span>
        )}
        {unresolvedBlockers !== undefined && unresolvedBlockers > 0 && (
          <span className="flex items-center gap-1 text-alert font-semibold">
            <BlockerIcon size={10} />
            {t('blockers', { count: unresolvedBlockers })}
          </span>
        )}
        {blocked && <span className="text-alert font-semibold">{t('blocked')}</span>}
        <span className="ml-auto tabular-nums text-foreground/75">
          {cost !== undefined ? formatUsd(locale, cost) : '—'}
        </span>
      </div>

      {(task.project || tags.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-1">
          {task.project && <Badge variant="secondary">{task.project}</Badge>}
          {tags.map((tag) => (
            <Badge key={tag} variant="default" color={tagColors[tag]}>
              #{tag}
            </Badge>
          ))}
        </div>
      )}

      {waiting && (
        // biome-ignore lint/a11y/noStaticElementInteractions: stops the strip's own click
        <div className="flex flex-wrap gap-1.5 mt-2" onClick={stop} onKeyDown={stop}>
          {waiting.kind === 'approval' && approvalId && !pendingDecision && (
            <>
              <Button
                variant="primary"
                size="xs"
                disabled={!approvals?.canDecide}
                // biome-ignore lint/a11y/noAutofocus: returns focus after Deshacer
                autoFocus={justUndone}
                data-decide="approve"
                aria-keyshortcuts="A"
                onClick={() => approvals?.queue(approvalId, 'approved')}
              >
                {t('approve')}
              </Button>
              <Button
                variant="danger"
                size="xs"
                disabled={!approvals?.canDecide}
                data-decide="reject"
                aria-keyshortcuts="X"
                onClick={() => approvals?.queue(approvalId, 'rejected')}
              >
                {t('reject')}
              </Button>
              {!approvals?.canDecide && (
                <p className="basis-full text-xs text-muted">{t('pickUserToDecide')}</p>
              )}
            </>
          )}
          {waiting.kind === 'approval' && approvalId && pendingDecision && (
            <div role="status" className="basis-full flex items-center gap-2">
              <span
                className={cn(
                  'text-sm font-semibold',
                  pendingDecision.decision === 'approved' ? 'text-ok' : 'text-alert',
                )}
              >
                {pendingDecision.decision === 'approved'
                  ? t('approvedPending')
                  : t('rejectedPending')}
              </span>
              <UndoCountdown sendAt={pendingDecision.sendAt} total={UNDO_MS} />
              <Button
                variant="secondary"
                size="xs"
                className="ml-auto"
                // biome-ignore lint/a11y/noAutofocus: keyboard users get the undo window
                autoFocus
                onClick={() => {
                  setJustUndone(true)
                  approvals?.undo(approvalId)
                }}
              >
                {t('undo')}
              </Button>
            </div>
          )}
          {waiting.kind === 'merge' && (
            <Button
              variant="primary"
              size="xs"
              onClick={() => router.push(`/task/${task.id}?review=merge`)}
            >
              {t('reviewAndMerge')}
            </Button>
          )}
          {waiting.kind === 'clarify' && (
            <Button variant="primary" size="xs" onClick={open}>
              {t('answer')}
            </Button>
          )}
          {decisionError && (
            <p role="alert" className="basis-full text-xs text-alert">
              {decisionError === 'already_decided' ? t('alreadyDecided') : t('decideFailed')}
            </p>
          )}
        </div>
      )}

      {task.status === 'INBOX' && !task.assigned_to && (
        // biome-ignore lint/a11y/noStaticElementInteractions: stops the strip's own click
        <div className="mt-1.5 relative" onClick={stop} onKeyDown={stop}>
          <Button
            variant="secondary"
            size="xs"
            disabled={isAssigning}
            onClick={() => setShowAssign(!showAssign)}
            aria-expanded={showAssign}
          >
            {isAssigning ? t('assigning') : t('assign')}
          </Button>

          {showAssign && (
            <Card
              padding="none"
              className="absolute top-full left-0 min-w-48 mt-1 shadow-[0_6px_14px_rgba(0,0,0,0.25)] z-10 overflow-hidden"
            >
              {assignable.map((agent) => {
                const k = participantKind(agent)
                return (
                  <Button
                    key={agent.id}
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setShowAssign(false)
                      onAssign(task.id, agent.id)
                    }}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-left rounded-none"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'w-1 h-3 rounded-[1px]',
                        k === 'person' ? 'bg-person' : 'bg-agent',
                      )}
                    />
                    <span className="truncate">{agent.name}</span>
                    <span className="ml-auto text-muted">
                      {k === 'person' ? t('person') : t('agent')}
                    </span>
                  </Button>
                )
              })}
            </Card>
          )}
        </div>
      )}
    </div>
  )
})
