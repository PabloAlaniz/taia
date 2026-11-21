'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { SessionListItem, Agent } from '@taia/types'
import { api } from '@/lib/api'
import { useResource } from '@/lib/use-resource'
import { Select } from '../atoms'
import { SkeletonCard, EmptyState } from '../molecules'
import { SessionCard } from '../molecules/session-card'

type SortField = 'date' | 'tokens' | 'cost'

export function SessionList() {
  const tr = useTranslations('runtime')

  // Filters
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortField>('date')

  const { data, loading, error } = useResource(
    `${agentFilter}|${statusFilter}`,
    async (): Promise<{ sessions: SessionListItem[]; agents: Agent[] }> => {
      const [sessionsData, agentsData] = await Promise.all([
        api.sessions.list({
          agent_id: agentFilter || undefined,
          status: statusFilter,
          limit: 100,
        }),
        api.agents.list(),
      ])
      return { sessions: sessionsData.sessions || [], agents: agentsData.agents || [] }
    },
  )
  const sessions = data?.sessions ?? []
  const agents = data?.agents ?? []

  // Sort
  const sorted = [...sessions].sort((a, b) => {
    if (sortBy === 'tokens') return (b.totalTokens || 0) - (a.totalTokens || 0)
    if (sortBy === 'cost') return (b.estimatedCostUsd || 0) - (a.estimatedCostUsd || 0)
    return b.updatedAt - a.updatedAt
  })

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (error) {
    return <EmptyState icon="⚠️" title={tr('unavailable')} description={error} className="p-8" />
  }

  return (
    <div className="p-4">
      {/* Filter bar */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-2xs text-muted">Agente:</span>
          <Select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="text-xs bg-background border border-border rounded-sm px-1.5 py-0.5 text-foreground w-auto"
          >
            <option value="">Todos</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.avatar} {a.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-2xs text-muted">Status:</span>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-background border border-border rounded-sm px-1.5 py-0.5 text-foreground w-auto"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="recent">Recientes</option>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-2xs text-muted">Orden:</span>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
            className="text-xs bg-background border border-border rounded-sm px-1.5 py-0.5 text-foreground w-auto"
          >
            <option value="date">Fecha</option>
            <option value="tokens">Tokens</option>
            <option value="cost">Costo</option>
          </Select>
        </div>

        <div className="text-2xs text-muted ml-auto">{sorted.length} sesiones</div>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <EmptyState icon="📭" title="No se encontraron sesiones" />
      ) : (
        <div className="space-y-2">
          {sorted.map((session) => (
            <SessionCard key={session.key} session={session} />
          ))}
        </div>
      )}
    </div>
  )
}
