'use client'

import { AgentCard } from './agent-card'
import { useTranslations } from 'next-intl'
import { Agent, Task } from '@taia/types'
import { X } from 'lucide-react'
import { Button } from '../atoms'

interface AgentPanelProps {
  agents: Agent[]
  tasks: Task[]
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
  /** Mobile: whether the panel is open (overlay mode). Ignored on lg+ where it's always visible. */
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function AgentPanel({
  agents,
  tasks,
  selectedAgentId,
  onSelectAgent,
  mobileOpen,
  onMobileClose,
}: AgentPanelProps) {
  const t = useTranslations('agents')

  const getTaskCount = (agentId: string) =>
    tasks.filter((t) => t.assigned_to === agentId && t.status !== 'DONE').length

  const selectedAgent = selectedAgentId ? agents.find((a) => a.id === selectedAgentId) : null

  const aiAgents = agents.filter((a) => a.type !== 'human')
  const humanAgents = agents.filter((a) => a.type === 'human')

  const panelContent = (
    <>
      {selectedAgent && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onSelectAgent(selectedAgentId!)}
          className="w-full mb-2 flex items-center justify-between"
        >
          <span className="truncate">{t('filtering', { name: selectedAgent.name })}</span>
          <X size={13} aria-hidden="true" />
        </Button>
      )}

      <h2 className="text-xs font-semibold tracking-[0.08em] uppercase mb-2 text-muted">
        {t('heading')}
      </h2>
      {aiAgents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          taskCount={getTaskCount(agent.id)}
          selected={agent.id === selectedAgentId}
          onSelect={() => onSelectAgent(agent.id)}
        />
      ))}

      {humanAgents.length > 0 && (
        <>
          <h2 className="text-xs font-semibold tracking-[0.08em] uppercase mt-4 mb-2 text-muted">
            {t('team')}
          </h2>
          {humanAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              taskCount={getTaskCount(agent.id)}
              selected={agent.id === selectedAgentId}
              onSelect={() => onSelectAgent(agent.id)}
            />
          ))}
        </>
      )}
    </>
  )

  return (
    <>
      {/* Wide screens: always-visible rail. Below ~1400px the five bays need
          the width, so the rail opens as an overlay from the board header. */}
      <aside className="hidden min-[1400px]:block w-52 pl-6 pr-1 pt-1 pb-4 overflow-y-auto shrink-0">
        {panelContent}
      </aside>

      {/* Mobile/Tablet: overlay panel */}
      {mobileOpen && (
        <div className="min-[1400px]:hidden fixed inset-0 z-40 flex">
          <aside className="w-64 bg-background border-r border-border p-4 overflow-y-auto animate-[slideInLeft_200ms_ease-out]">
            {panelContent}
          </aside>
          <div className="flex-1 bg-black/30" onClick={onMobileClose} aria-hidden="true" />
        </div>
      )}
    </>
  )
}
