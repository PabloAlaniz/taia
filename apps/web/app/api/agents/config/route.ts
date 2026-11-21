import { NextResponse } from 'next/server'
import { forEachRuntime, mergeAgentListings } from '@taia/core/runtime'
import { RuntimeCapability, type RuntimeCronJob, type RuntimeSettingsSnapshot } from '@taia/runtime'
import { getAllTasks } from '@taia/core/db'
import { getActiveIdentity } from '@taia/core/services/agent-context.service'
import { effectiveModel, getRuntimeSettings } from '@taia/core/services/runtime-settings.service'

export const dynamic = 'force-dynamic'

interface AgentConfig {
  id: string
  name: string
  model: string
  heartbeat: {
    schedule: string
    timeoutSeconds: number
    nextRunAt?: string
  }
  tools: {
    denied: string[]
  }
  personaSummary?: string
  workingStatus?: string
}

interface InstanceAgent {
  id: string
  name?: string
  deniedTools?: string[]
  snapshot: RuntimeSettingsSnapshot
  crons: RuntimeCronJob[]
}

/** Each agent as the instance it runs on reports it. */
async function listInstanceAgents(): Promise<InstanceAgent[]> {
  const { results } = await forEachRuntime(async (adapter): Promise<InstanceAgent[]> => {
    const view = await getRuntimeSettings(adapter)
    if (!view.settings) return []
    const snapshot = view.settings
    const crons =
      adapter.capabilities.has(RuntimeCapability.Cron) && adapter.listCrons
        ? await adapter.listCrons()
        : []
    return Object.entries(snapshot.agents).map(([id, settings]) => ({
      id,
      ...settings,
      snapshot,
      crons,
    }))
  })
  return (await mergeAgentListings(results, (a) => a.id)).map((a) => a.value)
}

export async function GET() {
  try {
    const agentList = await listInstanceAgents()
    const agents: AgentConfig[] = []
    const inProgressAgents = new Set(
      (await getAllTasks()).filter((t) => t.status === 'IN_PROGRESS').map((t) => t.assigned_to),
    )

    for (const agent of agentList) {
      const cronJob = agent.crons.find((j) => j.agentId === agent.id)

      // First line of the persona, else the role.
      const identity = await getActiveIdentity(agent.id)
      const personaLine = identity?.persona.split('\n').find((l) => l.trim() && !l.startsWith('#'))
      const personaSummary = (personaLine || identity?.role || '').slice(0, 200)

      const workingStatus = inProgressAgents.has(agent.id) ? 'IN_PROGRESS' : 'IDLE'

      const model = effectiveModel(agent.snapshot, agent.id)?.primary ?? 'default'

      agents.push({
        id: agent.id,
        name: agent.name || agent.id,
        model,
        heartbeat: {
          schedule: cronJob?.schedule?.expr || 'Not configured',
          timeoutSeconds: cronJob?.payload?.timeoutSeconds || 0,
          nextRunAt: cronJob?.state?.nextRunAtMs
            ? new Date(cronJob.state.nextRunAtMs).toISOString()
            : undefined,
        },
        tools: {
          denied: agent.deniedTools ?? [],
        },
        personaSummary,
        workingStatus,
      })
    }

    return NextResponse.json({ agents })
  } catch (error) {
    console.error('Error reading agent config:', error)
    return NextResponse.json({ error: 'Failed to read agent configuration' }, { status: 500 })
  }
}
