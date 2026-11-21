// Agent service — the squad as the runtime instances report it, enriched
// with TAIA's metadata, task load and context.

import {
  getAllTasks,
  getAllAgents,
  getAgentById,
  createAgent as createAgentInDb,
  deleteAgent as deleteAgentInDb,
  setAgentRuntimeInstanceId,
} from '../db/index'
import { getAgentContextSummary, type AgentContextSummary } from './context.service'
import { buildInitialIdentity, saveAgentIdentity } from './agent-context.service'
import {
  deprovisionAgentFromRuntime,
  provisionAgentsInRuntime,
  type RuntimeDeprovisioningReport,
  type RuntimeProvisioningReport,
} from './agent-runtime-settings.service'
import { getNextHeartbeat } from '../agent-runtime'
import { forEachRuntime, mergeAgentListings, type InstanceResult } from '../runtime'
import { getDefaultInstanceId, loadAgentInstanceResolver } from '../runtime-instances'
import {
  RuntimeCapability,
  type AgentRuntimeAdapter,
  type RuntimeAgent,
  type RuntimeCronJob,
} from '@taia/runtime'
import { getDefaultRole, getDefaultAvatar } from '../agents/metadata'
import type { AgentRecord, AgentType, Task } from '@taia/types'

// --- Types ---

export interface EnrichedAgent {
  id: string
  name: string
  role: string
  avatar: string
  status: 'IDLE' | 'WORKING' | 'BLOCKED'
  type: AgentType
  enabled: boolean
  nextRunIn?: string
  nextRunAtMs?: number
  cron?: {
    id: string
    enabled: boolean
    schedule: string
    scheduleRaw?: string
    nextRun?: string
    lastRun?: string
    lastStatus?: string
    lastError?: string
    lastDurationMs?: number
  }
  /** Which parts of the agent's context are filled in. */
  context?: AgentContextSummary
  tasks?: {
    assigned: number
    inProgress: number
    review: number
    done: number
  }
}

export interface EnrichedAgentsResult {
  agents: EnrichedAgent[]
  source: 'runtime' | 'database-fallback'
}

// --- Private helpers ---

function parseCronSchedule(config: string): string | undefined {
  try {
    const parsed = JSON.parse(config)
    return parsed.cron_schedule || undefined
  } catch {
    return undefined
  }
}

function formatSchedule(schedule: RuntimeCronJob['schedule']): string {
  if (schedule.kind === 'cron' && schedule.expr) {
    const match = schedule.expr.match(/^0 \*\/(\d+) \* \* \*$/)
    if (match) return `every ${match[1]}h`
    return schedule.expr
  }
  if (schedule.kind === 'every' && schedule.everyMs) {
    const hours = schedule.everyMs / (1000 * 60 * 60)
    return hours >= 1 ? `every ${hours}h` : `every ${schedule.everyMs / 60000}m`
  }
  return 'unknown'
}

async function fetchCrons(adapter: AgentRuntimeAdapter): Promise<RuntimeCronJob[]> {
  try {
    if (!adapter.capabilities.has(RuntimeCapability.Cron) || !adapter.listCrons) return []
    return await adapter.listCrons()
  } catch {
    return []
  }
}

// --- Shared helpers ---

function computeAgentStatuses(tasks: Task[]): {
  working: Set<string>
  blocked: Set<string>
} {
  const working = new Set<string>()
  const blocked = new Set<string>()
  for (const task of tasks) {
    if (task.assigned_to) {
      if (task.status === 'ASSIGNED' || task.status === 'IN_PROGRESS') {
        working.add(task.assigned_to)
      } else if (task.tags?.includes('blocked')) {
        blocked.add(task.assigned_to)
      }
    }
  }
  return { working, blocked }
}

function sortAgents(agents: EnrichedAgent[]): void {
  agents.sort((a, b) => {
    if (a.type === 'orchestrator') return -1
    if (b.type === 'orchestrator') return 1
    return a.name.localeCompare(b.name)
  })
}

async function addFullDetail(
  agent: EnrichedAgent,
  tasks: Task[],
  cron?: RuntimeCronJob,
): Promise<void> {
  if (cron) {
    agent.cron = {
      id: cron.id,
      enabled: cron.enabled,
      schedule: formatSchedule(cron.schedule),
      scheduleRaw: cron.schedule.kind === 'cron' ? cron.schedule.expr : undefined,
      nextRun: cron.state?.nextRunAtMs ? new Date(cron.state.nextRunAtMs).toISOString() : undefined,
      lastRun: cron.state?.lastRunAtMs ? new Date(cron.state.lastRunAtMs).toISOString() : undefined,
      lastStatus: cron.state?.lastStatus,
      lastError: cron.state?.lastError,
      lastDurationMs: cron.state?.lastDurationMs,
    }
  }

  agent.context = await getAgentContextSummary(agent.id)

  const agentTasks = tasks.filter((t) => t.assigned_to === agent.id)
  agent.tasks = {
    assigned: agentTasks.filter((t) => t.status === 'ASSIGNED').length,
    inProgress: agentTasks.filter((t) => t.status === 'IN_PROGRESS').length,
    review: agentTasks.filter((t) => t.status === 'REVIEW').length,
    done: agentTasks.filter((t) => t.status === 'DONE').length,
  }
}

// --- Enrichment ---

interface EnrichContext {
  tasks: Task[]
  working: Set<string>
  blocked: Set<string>
  fullDetail: boolean
}

async function loadContext(fullDetail: boolean): Promise<EnrichContext> {
  const tasks = await getAllTasks()
  return { tasks, ...computeAgentStatuses(tasks), fullDetail }
}

async function toEnrichedAgent(
  id: string,
  name: string | undefined,
  dbData: AgentRecord | undefined,
  ctx: EnrichContext,
  cron?: RuntimeCronJob,
): Promise<EnrichedAgent> {
  const type: AgentType = dbData?.type || 'cron'
  // Humans have no heartbeat.
  const cronSchedule = dbData?.config ? parseCronSchedule(dbData.config) : undefined
  const nextHeartbeat = type === 'human' ? null : getNextHeartbeat(id, cronSchedule)

  let status: EnrichedAgent['status'] = 'IDLE'
  if (ctx.working.has(id)) status = 'WORKING'
  else if (ctx.blocked.has(id)) status = 'BLOCKED'

  const agent: EnrichedAgent = {
    id,
    name: name || id,
    role: dbData?.role || getDefaultRole(id),
    avatar: dbData?.avatar || getDefaultAvatar(id),
    status,
    type,
    enabled: dbData?.enabled !== 0 && dbData?.enabled !== false,
    nextRunIn: nextHeartbeat?.nextRunIn,
    nextRunAtMs: nextHeartbeat?.nextRunAtMs,
  }

  if (ctx.fullDetail) await addFullDetail(agent, ctx.tasks, cron)
  return agent
}

/**
 * Create the TAIA record of agents a runtime reports but TAIA does not know
 * yet. An agent first seen on an instance other than the default is assigned
 * to it, so per-agent calls reach the runtime that has it.
 */
async function syncMissingAgents(
  listed: InstanceResult<RuntimeAgent>[],
): Promise<Map<string, AgentRecord>> {
  const dbAgents = await getAllAgents(true)
  const known = new Set(dbAgents.map((a) => a.id))
  const missing = listed.filter(({ value }) => !known.has(value.id))
  if (missing.length === 0) return new Map(dbAgents.map((a) => [a.id, a]))

  const defaultId = await getDefaultInstanceId()
  for (const { instanceId, value } of missing) {
    await createAgentInDb({
      id: value.id,
      name: value.name || value.id,
      role: getDefaultRole(value.id),
      avatar: getDefaultAvatar(value.id),
      type: 'cron' as AgentType,
    })
    if (instanceId !== defaultId) await setAgentRuntimeInstanceId(value.id, instanceId)
    console.log(`[agents] Auto-synced new agent from runtime ${instanceId}: ${value.id}`)
  }
  return new Map((await getAllAgents(true)).map((a) => [a.id, a]))
}

interface RuntimeListing {
  agents: InstanceResult<RuntimeAgent>[]
  /** Cron jobs per instance (fullDetail only). */
  crons: Map<string, RuntimeCronJob[]>
  /** Instances that did not answer. */
  unreachable: Set<string>
}

async function enrichFromRuntime(
  listing: RuntimeListing,
  fullDetail: boolean,
): Promise<EnrichedAgent[]> {
  const dbMetadata = await syncMissingAgents(listing.agents)
  const [ctx, instanceOf] = await Promise.all([
    loadContext(fullDetail),
    loadAgentInstanceResolver(),
  ])

  const agents: EnrichedAgent[] = []
  for (const { instanceId, value: rtAgent } of listing.agents) {
    const cron = listing.crons.get(instanceId)?.find((c) => c.agentId === rtAgent.id)
    agents.push(
      await toEnrichedAgent(rtAgent.id, rtAgent.name, dbMetadata.get(rtAgent.id), ctx, cron),
    )
  }

  // Agents no runtime listed: humans, which live only in TAIA, and agents
  // whose instance did not answer, which still belong on the board.
  const listed = new Set(listing.agents.map((a) => a.value.id))
  for (const dbAgent of Array.from(dbMetadata.values())) {
    if (listed.has(dbAgent.id)) continue
    const instanceId = instanceOf(dbAgent.id)
    const unreachable = instanceId !== null && listing.unreachable.has(instanceId)
    if (dbAgent.type === 'human' || unreachable) {
      agents.push(await toEnrichedAgent(dbAgent.id, dbAgent.name, dbAgent, ctx))
    }
  }

  sortAgents(agents)
  return agents
}

async function enrichFromDatabase(fullDetail: boolean): Promise<EnrichedAgent[]> {
  const dbAgents = await getAllAgents(true)
  if (dbAgents.length === 0) return []

  const ctx = await loadContext(fullDetail)
  const agents = await Promise.all(
    dbAgents.map((dbAgent) => toEnrichedAgent(dbAgent.id, dbAgent.name, dbAgent, ctx)),
  )
  sortAgents(agents)
  return agents
}

// --- Public API ---

export async function fetchEnrichedAgents(fullDetail: boolean): Promise<EnrichedAgentsResult> {
  const { results, failures } = await forEachRuntime(async (adapter) => {
    const [agents, crons] = await Promise.all([
      adapter.listAgents(),
      fullDetail ? fetchCrons(adapter) : [],
    ])
    return { agents, crons }
  })
  const agents = await mergeAgentListings(
    results.map(({ instanceId, value }) => ({
      instanceId,
      value: value.agents,
    })),
    (a) => a.id,
  )

  if (agents.length > 0) {
    const listing: RuntimeListing = {
      agents,
      crons: new Map(results.map(({ instanceId, value }) => [instanceId, value.crons])),
      unreachable: new Set(failures.map((f) => f.instanceId)),
    }
    return {
      agents: await enrichFromRuntime(listing, fullDetail),
      source: 'runtime',
    }
  }

  // No runtime reported agents: build the squad from PostgreSQL
  const dbAgents = await enrichFromDatabase(fullDetail)
  return { agents: dbAgents, source: 'database-fallback' }
}

export interface CreateAgentResult {
  agent: AgentRecord
  /** Null for humans, who live only in TAIA. */
  runtimeProvisioning: RuntimeProvisioningReport | null
}

/**
 * Create an agent: its TAIA record, a clean typed identity (as setup and
 * workspace creation seed it) and the agent in its runtime instance.
 */
export async function createAgent(data: {
  id: string
  name: string
  role?: string
  avatar?: string
  type?: AgentType
}): Promise<CreateAgentResult> {
  const agent = await createAgentInDb(data)
  await saveAgentIdentity(
    agent.id,
    buildInitialIdentity({
      id: agent.id,
      name: agent.name,
      role: agent.role ?? '',
    }),
    { createdBy: 'api', note: 'Initial identity on agent creation' },
  )
  const runtimeProvisioning =
    agent.type === 'human'
      ? null
      : await provisionAgentsInRuntime([{ id: agent.id, name: agent.name }])
  return { agent, runtimeProvisioning }
}

export interface RemoveAgentResult {
  /** Null for humans, who live only in TAIA. */
  runtimeDeprovisioning: RuntimeDeprovisioningReport | null
}

/**
 * Remove an agent from its runtime instance (best effort) and then from
 * TAIA. Returns null when the agent does not exist.
 */
export async function removeAgent(agentId: string): Promise<RemoveAgentResult | null> {
  const agent = await getAgentById(agentId)
  if (!agent) return null
  const runtimeDeprovisioning =
    agent.type === 'human' ? null : await deprovisionAgentFromRuntime(agentId)
  if (!(await deleteAgentInDb(agentId))) return null
  return { runtimeDeprovisioning }
}
