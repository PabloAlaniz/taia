'use client'

import { AgentCard } from './agent-card'
import { useTranslations } from 'next-intl'
import { Agent, Task } from '@taia/types'
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
          className="w-full mb-2 text-accent bg-accent/10 flex items-center justify-between hover:bg-accent/20"
        >
          <span>{t('filtering', { name: selectedAgent.name })}</span>
          <span>✕</span>
        </Button>
      )}

      <h2 className="text-mid mb-2.5 text-muted">{t('heading')}</h2>
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
          <h2 className="text-mid mt-4 mb-2.5 text-muted">{t('team')}</h2>
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
      {/* Desktop: always-visible sidebar */}
      <aside className="hidden lg:block w-56 bg-card border-r border-border p-3 overflow-y-auto shrink-0">
        {panelContent}
      </aside>

      {/* Mobile/Tablet: overlay panel */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <aside className="w-64 bg-card border-r border-border p-3 overflow-y-auto animate-[slideInLeft_200ms_ease-out]">
            {panelContent}
          </aside>
          <div className="flex-1 bg-black/30" onClick={onMobileClose} aria-hidden="true" />
        </div>
      )}
    </>
  )
}
