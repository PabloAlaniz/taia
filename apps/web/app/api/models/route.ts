import { NextResponse } from 'next/server'
import { mergeAgentListings } from '@taia/core/runtime'
import { effectiveModel, listRuntimeSettings } from '@taia/core/services/runtime-settings.service'

export const dynamic = 'force-dynamic'

interface ModelInfo {
  id: string
  provider: string
  name: string
  isDefault?: boolean
  /** Instances that run this model by default. */
  defaultFor: string[]
  usedBy: string[]
}

function toModelInfo(ref: string): ModelInfo {
  const [provider, ...rest] = ref.split('/')
  return { id: ref, provider, name: rest.join('/') || provider, defaultFor: [], usedBy: [] }
}

/** Models the runtime instances run, with the agents that use each one. */
export async function GET() {
  try {
    const { results, failures } = await listRuntimeSettings()
    if (results.length === 0 && failures.length > 0) {
      throw new Error(failures.map((f) => `${f.instanceId}: ${f.error}`).join('; '))
    }
    const snapshots = results.flatMap(({ instanceId, value }) =>
      value.settings ? [{ instanceId, snapshot: value.settings }] : [],
    )
    if (snapshots.length === 0) {
      // Not an error: no runtime publishes its settings.
      const provider = results[0]?.value.provider ?? null
      return NextResponse.json({ ok: true, supported: false, provider, models: [] })
    }

    const models = new Map<string, ModelInfo>()
    const modelFor = (ref: string) => {
      const info = models.get(ref) ?? toModelInfo(ref)
      models.set(ref, info)
      return info
    }

    for (const { instanceId, snapshot } of snapshots) {
      const defaultModel = snapshot.defaults.model?.primary
      if (!defaultModel) continue
      const info = modelFor(defaultModel)
      info.isDefault = true
      info.defaultFor.push(instanceId)
    }

    // Each agent counts once, with the model of the instance it runs on.
    const agents = await mergeAgentListings(
      snapshots.map(({ instanceId, snapshot }) => ({
        instanceId,
        value: Object.keys(snapshot.agents).map((agentId) => ({ agentId, snapshot })),
      })),
      (a) => a.agentId,
    )
    for (const { value } of agents) {
      const ref = effectiveModel(value.snapshot, value.agentId)?.primary
      if (ref) modelFor(ref).usedBy.push(value.agentId)
    }

    const sorted = Array.from(models.values()).sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
      return a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name)
    })

    return NextResponse.json({
      ok: true,
      models: sorted,
      instances: snapshots.map((s) => s.instanceId),
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      models: [],
    })
  }
}
