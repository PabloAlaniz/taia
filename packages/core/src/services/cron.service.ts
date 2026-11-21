// Cron service — manages agent cron jobs on each agent's runtime instance.

import { getRuntimeAdapterForAgent } from '../runtime'
import { RuntimeCapability, requireCapabilityMethod, type RuntimeCronJob } from '@taia/runtime'
import { config } from '../config'
import { getSetting } from '../db/index'
import { NotFoundError } from '../errors'

// --- Helpers ---

async function getDefaultTz(): Promise<string> {
  const dbTz = await getSetting('app.default_tz')
  return dbTz || config.cron.defaultTz
}

async function getCronOps(agentId: string) {
  const adapter = await getRuntimeAdapterForAgent(agentId)
  const listCrons = requireCapabilityMethod(adapter, RuntimeCapability.Cron, 'listCrons')
  const cronAction = requireCapabilityMethod(adapter, RuntimeCapability.Cron, 'cronAction')
  return { listCrons, cronAction }
}

async function findCronForAgent(agentId: string): Promise<RuntimeCronJob> {
  const { listCrons } = await getCronOps(agentId)
  const jobs = await listCrons()
  // Jobs the runtime declares itself (its own heartbeat, plugin jobs) are not
  // TAIA's to edit; manage only the ones TAIA created.
  const job = jobs.find((j) => j.agentId === agentId && !j.managedByRuntime)
  if (!job) {
    throw new NotFoundError('Cron job', agentId)
  }
  return job
}

// --- Public API ---

export async function getCronForAgent(agentId: string) {
  const job = await findCronForAgent(agentId)
  return {
    agentId,
    cronId: job.id,
    enabled: job.enabled ?? true,
    schedule: job.schedule?.expr || '',
    tz: job.schedule?.tz || (await getDefaultTz()),
    nextRun: job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : null,
    lastRun: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : null,
    lastStatus: job.state?.lastStatus || null,
    lastError: job.state?.lastError || null,
    lastDurationMs: job.state?.lastDurationMs || null,
  }
}

export async function createCron(input: {
  agentId: string
  schedule: string
  enabled?: boolean
  timeoutSeconds?: number
}) {
  const { cronAction } = await getCronOps(input.agentId)

  const params: Record<string, unknown> = {
    agentId: input.agentId,
    schedule: {
      kind: 'cron',
      expr: input.schedule,
      tz: await getDefaultTz(),
    },
    enabled: input.enabled ?? true,
  }

  if (input.timeoutSeconds) {
    params.payload = { timeoutSeconds: input.timeoutSeconds }
  }

  const result = await cronAction('add', params)
  return result
}

export async function updateCron(
  agentId: string,
  input: {
    enabled?: boolean
    schedule?: string
    timeoutSeconds?: number
  },
) {
  const job = await findCronForAgent(agentId)
  const { cronAction } = await getCronOps(agentId)

  const params: Record<string, unknown> = { id: job.id }

  if (typeof input.enabled === 'boolean') {
    params.enabled = input.enabled
  }

  if (input.schedule) {
    params.schedule = {
      kind: 'cron',
      expr: input.schedule,
      tz: await getDefaultTz(),
    }
  }

  if (input.timeoutSeconds) {
    params.payload = { timeoutSeconds: input.timeoutSeconds }
  }

  await cronAction('update', params)

  return {
    agentId,
    cronId: job.id,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : job.enabled,
    schedule: input.schedule || job.schedule?.expr,
  }
}

export async function removeCron(agentId: string) {
  const job = await findCronForAgent(agentId)
  const { cronAction } = await getCronOps(agentId)
  await cronAction('remove', { id: job.id })
  return { agentId, cronId: job.id, removed: true }
}

export async function triggerCronRun(agentId: string) {
  const job = await findCronForAgent(agentId)
  const { cronAction } = await getCronOps(agentId)
  const result = await cronAction('run', { id: job.id })
  return { agentId, cronId: job.id, triggered: true, result }
}

export async function getCronHistory(agentId: string) {
  const job = await findCronForAgent(agentId)
  const { cronAction } = await getCronOps(agentId)
  const result = (await cronAction('runs', { id: job.id })) as { runs?: unknown[] }
  return { agentId, cronId: job.id, runs: result?.runs || [] }
}
