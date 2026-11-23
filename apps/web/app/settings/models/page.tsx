'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Cpu, Info } from 'lucide-react'
import { Alert, ParticipantMark, Strip } from '@/components/atoms'
import { EmptyState } from '@/components/molecules/empty-state'
import { RackSection } from '@/components/molecules/rack-section'
import { useResource } from '@/lib/use-resource'
import { PageHeader } from '@/components/molecules/page-header'

interface ModelInfo {
  id: string
  provider: string
  name: string
  isDefault?: boolean
  /** Instances that run this model by default. */
  defaultFor?: string[]
  usedBy?: string[]
}

interface ModelsResponse {
  ok: boolean
  models: ModelInfo[]
  supported?: boolean
  provider?: string
  /** Instances whose settings were read. */
  instances?: string[]
  error?: string
}

async function loadModels(): Promise<ModelsResponse> {
  const res = await fetch('/api/models')
  const data = (await res.json()) as ModelsResponse
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export default function ModelsPage() {
  const tp = useTranslations('pageTitles')
  const t = useTranslations('modelsPage')
  const tm = useTranslations('settingsModels')
  const { data, loading, error } = useResource('/api/models', loadModels)
  const models = data?.models ?? []
  const unsupportedProvider = data?.supported === false ? (data.provider ?? null) : null
  // No runtime at all (standalone): nothing configures models. What past
  // sessions used is a record, shown on the dashboard, not a configuration.
  const standalone = data?.supported === false && !data.provider
  // Name the instances only when there is more than one to tell apart.
  const multiInstance = (data?.instances?.length ?? 0) > 1

  return (
    <div className="min-h-full bg-background">
      <PageHeader width="form" title={t('title')} backHref="/settings" backLabel={tp('settings')} />

      <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto space-y-4">
        <p className="text-muted text-sm max-w-prose">{t('description')}</p>

        {unsupportedProvider && (
          <Alert variant="info">
            {t('unsupported', { provider: unsupportedProvider })}{' '}
            <Link href="/settings/runtime" className="underline">
              {t('runtimeLink')}
            </Link>
          </Alert>
        )}

        {standalone && (
          <Alert variant="info">
            {t('standalone')}{' '}
            <Link href="/dashboard" className="underline">
              {t('standaloneDashboardLink')}
            </Link>{' '}
            ·{' '}
            <Link href="/settings/runtime" className="underline">
              {t('runtimeLink')}
            </Link>
          </Alert>
        )}

        {error && (
          <Alert variant="error">
            <p>{tm('loadFailed')}</p>
            <p className="text-xs text-muted font-normal mt-1 font-mono">{error}</p>
          </Alert>
        )}

        {(loading || models.length > 0 || (!error && !unsupportedProvider && !standalone)) && (
          <RackSection
            id="settings-models"
            title={t('title')}
            count={loading ? undefined : models.length}
          >
            {loading ? (
              <p className="text-mid text-on-rack-muted py-2" role="status">
                {t('loading')}
              </p>
            ) : models.length === 0 ? (
              <EmptyState
                onRack
                className="py-4 px-0"
                icon={<Cpu size={20} aria-hidden="true" />}
                title={t('empty')}
              />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {models.map((model) => (
                  <li key={model.id}>
                    <Strip className="py-2.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-sm font-medium text-foreground break-all">
                          {model.id}
                        </span>
                        {model.isDefault && (
                          <span className="text-xxs font-semibold text-foreground bg-card border border-border px-1.5 py-px rounded-[3px]">
                            {multiInstance && model.defaultFor?.length
                              ? tm('defaultFor', { instances: model.defaultFor.join(', ') })
                              : tm('default')}
                          </span>
                        )}
                      </div>
                      <div className="text-mid text-muted mt-0.5">
                        {t('provider')} <span className="text-foreground">{model.provider}</span>
                      </div>

                      {model.usedBy && model.usedBy.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-mid">
                          <span className="text-muted">{t('usedBy')}</span>
                          {model.usedBy.map((agentId) => (
                            <Link
                              key={agentId}
                              href={`/squad`}
                              className="inline-flex items-center gap-1.5 font-semibold text-agent-ink no-underline hover:underline"
                            >
                              <ParticipantMark />
                              {agentId}
                            </Link>
                          ))}
                        </div>
                      )}
                    </Strip>
                  </li>
                ))}
              </ul>
            )}
          </RackSection>
        )}

        <section className="pt-2">
          <h2 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
            <Info size={15} className="text-muted" aria-hidden="true" />
            {tm('infoTitle')}
          </h2>
          <p className="text-sm text-muted max-w-prose">{t('info')}</p>
        </section>
      </div>
    </div>
  )
}
