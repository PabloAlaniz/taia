'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowDown } from 'lucide-react'
import type { SessionListItem, Agent } from '@taia/types'
import { api } from '@/lib/api'
import { useResource } from '@/lib/use-resource'
import { cn, sessionHref } from '../../lib/utils'
import { formatTokens, formatUsd, participantKind } from '../../lib/format'
import { Select, Strip } from '../atoms'
import { EmptyState, RackSection, SkeletonCard } from '../molecules'

type SortField = 'date' | 'tokens' | 'cost'

const COLS = 'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_5rem_7rem] gap-x-4 items-baseline'

/** Every session, as a sortable table of strips. */
export function SessionList() {
  const t = useTranslations('sessionsPage')
  const locale = useLocale()
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortField>('date')

  const { data, loading, error } = useResource(
    `${agentFilter}|${statusFilter}`,
    async (): Promise<{ sessions: SessionListItem[]; agents: Agent[] }> => {
      const [sessionsData, agentsData] = await Promise.all([
        api.sessions.list({ agent_id: agentFilter || undefined, status: statusFilter, limit: 100 }),
        api.agents.list(),
      ])
      return { sessions: sessionsData.sessions || [], agents: agentsData.agents || [] }
    },
    { keepPreviousData: true },
  )
  const sessions = data?.sessions ?? []
  const agents = data?.agents ?? []

  const sorted = [...sessions].sort((a, b) => {
    if (sortBy === 'tokens') return (b.totalTokens || 0) - (a.totalTokens || 0)
    if (sortBy === 'cost') return (b.estimatedCostUsd || 0) - (a.estimatedCostUsd || 0)
    return b.updatedAt - a.updatedAt
  })

  const selectClass =
    'text-mid bg-rack-deep border border-rack-line rounded px-2 py-1 text-on-rack w-auto focus:outline-hidden focus:border-on-rack-muted'

  return (
    <RackSection
      title={t('history')}
      count={loading ? undefined : sorted.length}
      aside={
        <>
          <label className="flex items-center gap-1.5">
            <span>{t('agent')}</span>
            <Select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className={selectClass}
            >
              <option value="">{t('all')}</option>
              {agents
                .filter((a) => a.type !== 'human')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </label>
          <label className="flex items-center gap-1.5">
            <span>{t('state')}</span>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={selectClass}
            >
              <option value="all">{t('all')}</option>
              <option value="active">{t('filterActive')}</option>
              <option value="recent">{t('filterRecent')}</option>
            </Select>
          </label>
        </>
      }
    >
      {loading ? (
        [1, 2, 3].map((i) => <SkeletonCard key={i} height="h-10" />)
      ) : error ? (
        <EmptyState onRack title={t('unavailable')} description={error} />
      ) : sorted.length === 0 ? (
        agentFilter || statusFilter !== 'all' ? (
          <EmptyState onRack title={t('noneFound')} description={t('noneFoundHint')} />
        ) : (
          <EmptyState onRack title={t('noneYet')} description={t('noneRunningHint')} />
        )
      ) : (
        <>
          <div
            className={cn(
              COLS,
              'pl-4 pr-3 pb-1 text-xs font-semibold tracking-[0.06em] uppercase text-on-rack-muted',
            )}
          >
            <span>{t('colSession')}</span>
            <span className="hidden md:block">{t('colModel')}</span>
            <SortHeader active={sortBy === 'tokens'} onClick={() => setSortBy('tokens')}>
              {t('colTokens')}
            </SortHeader>
            <SortHeader active={sortBy === 'cost'} onClick={() => setSortBy('cost')}>
              {t('colCost')}
            </SortHeader>
            <SortHeader active={sortBy === 'date'} onClick={() => setSortBy('date')}>
              {t('colActivity')}
            </SortHeader>
          </div>
          {sorted.map((s) => {
            const agent = agents.find((a) => a.id === s.agentId)
            const kind = participantKind(agent) ?? 'agent'
            return (
              <Strip key={s.key} kind={kind} quiet={s.status === 'offline'} className="py-1.5">
                <Link
                  href={sessionHref(s.key, s.instanceId)}
                  className={cn(
                    COLS,
                    'no-underline text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent rounded-[2px]',
                  )}
                >
                  <span className="min-w-0 flex items-baseline gap-2">
                    <span
                      className={cn(
                        'font-semibold truncate',
                        kind === 'person' ? 'text-person-ink' : 'text-agent-ink',
                      )}
                    >
                      {s.agentName || s.agentId}
                    </span>
                    <span className="text-sm truncate">{s.label}</span>
                  </span>
                  <span className="hidden md:block font-mono text-xs text-muted truncate">
                    {s.model?.split('/').pop() ?? '—'}
                  </span>
                  <span className="text-mid tabular-nums text-right text-muted">
                    {s.totalTokens ? formatTokens(s.totalTokens) : '—'}
                  </span>
                  <span className="text-mid tabular-nums text-right">
                    {s.estimatedCostUsd ? formatUsd(locale, s.estimatedCostUsd) : '—'}
                  </span>
                  <span className="text-mid text-muted text-right truncate">
                    {s.lastActivityAgo}
                  </span>
                </Link>
              </Strip>
            )
          })}
        </>
      )}
    </RackSection>
  )
}

function SortHeader({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    // eslint-disable-next-line no-restricted-syntax -- table header control on the rack
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center justify-end gap-1 uppercase tracking-[0.06em] font-semibold',
        active ? 'text-white' : 'hover:text-white',
      )}
    >
      {children}
      {active && <ArrowDown size={12} aria-hidden="true" />}
    </button>
  )
}
