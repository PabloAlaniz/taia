'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Cpu, Info } from 'lucide-react'
import { Card } from '@/components/molecules/card'
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
  // Name the instances only when there is more than one to tell apart.
  const multiInstance = (data?.instances?.length ?? 0) > 1

  return (
    <div className="min-h-full bg-background">
      <PageHeader title={t('title')} backHref="/settings" backLabel={tp('settings')} />

      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted text-sm mb-6">{t('description')}</p>

        {unsupportedProvider && (
          <Card padding="md" className="rounded-lg mb-6">
            <p className="text-sm text-muted">
              {t('unsupported', { provider: unsupportedProvider })}{' '}
              <Link href="/settings/runtime">{t('runtimeLink')}</Link>
            </p>
          </Card>
        )}

        {error && (
          <div role="alert" className="bg-alert/15 border border-alert/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-alert">{tm('loadFailed')}</p>
            <p className="text-xs text-muted mt-1 font-mono">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-muted text-center py-12">{t('loading')}</div>
        ) : (
          <div className="space-y-4">
            {models.map((model) => (
              <Card key={model.id} padding="md" className="rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-5 h-5 shrink-0 text-muted" aria-hidden="true" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-foreground">
                          {model.id}
                        </span>
                        {model.isDefault && (
                          <span className="text-xs px-2 py-0.5 rounded-sm bg-accent/20 text-accent">
                            {multiInstance && model.defaultFor?.length
                              ? tm('defaultFor', { instances: model.defaultFor.join(', ') })
                              : tm('default')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-1">
                        {t('provider')} <span className="text-foreground">{model.provider}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {model.usedBy && model.usedBy.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-xs text-muted mb-2">{t('usedBy')}</div>
                    <div className="flex flex-wrap gap-2">
                      {model.usedBy.map((agentId) => (
                        <Link
                          key={agentId}
                          href={`/squad`}
                          className="text-xs px-2 py-1 rounded-sm bg-background border border-border hover:border-accent transition-colors no-underline text-foreground"
                        >
                          {agentId}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))}

            {models.length === 0 && !error && !unsupportedProvider && (
              <div className="text-center text-muted py-12">{t('empty')}</div>
            )}
          </div>
        )}

        <Card padding="md" className="mt-8 rounded-lg">
          <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-muted" aria-hidden="true" />
            {tm('infoTitle')}
          </h3>
          <p className="text-xs text-muted">{t('info')}</p>
        </Card>
      </div>
    </div>
  )
}
