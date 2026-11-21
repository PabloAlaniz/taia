'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
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

const providerColors: Record<string, string> = {
  anthropic: '#D4A574',
  openai: '#10A37F',
  'openai-codex': '#10A37F',
  'github-copilot': '#6E40C9',
}

const providerIcons: Record<string, string> = {
  anthropic: '🅰️',
  openai: '🤖',
  'openai-codex': '💻',
  'github-copilot': '🐙',
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
  if (!data.ok) throw new Error(data.error || 'Failed to load models')
  return data
}

export default function ModelsPage() {
  const t = useTranslations('modelsPage')
  const { data, loading, error } = useResource('/api/models', loadModels)
  const models = data?.models ?? []
  const unsupportedProvider = data?.supported === false ? (data.provider ?? null) : null
  // Name the instances only when there is more than one to tell apart.
  const multiInstance = (data?.instances?.length ?? 0) > 1

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={t('title')} icon="🧠" backHref="/settings" />

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
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400">
            {error}
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
                    <span className="text-2xl">{providerIcons[model.provider] || '🤖'}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-foreground">
                          {model.id}
                        </span>
                        {model.isDefault && (
                          <span className="text-xs px-2 py-0.5 rounded-sm bg-accent/20 text-accent">
                            {multiInstance && model.defaultFor?.length
                              ? `default · ${model.defaultFor.join(', ')}`
                              : 'default'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-1">
                        {t('provider')}{' '}
                        <span style={{ color: providerColors[model.provider] || '#888' }}>
                          {model.provider}
                        </span>
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
          <h3 className="text-sm font-medium mb-2">💡 Info</h3>
          <p className="text-xs text-muted">{t('info')}</p>
        </Card>
      </div>
    </div>
  )
}
