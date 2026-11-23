'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button, Input, Select } from '@/components/atoms'
import { CURRENT_CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from '@taia/runtime/models'
import {
  findRuntimeProvider,
  providerSettingKey,
  RUNTIME_PROVIDERS,
  STANDALONE_PROVIDER,
  type ProviderField,
} from '@taia/runtime/providers'

const MASKED_SECRET = '********'

export interface RuntimeTestResult {
  ok: boolean
  provider?: string
  agents_found?: number
  model?: string
  error?: string
  hint?: string
}

export interface RuntimeSavedEvent {
  provider: string
  result: RuntimeTestResult
}

interface RuntimeProviderFormProps {
  /** Stored settings (`runtime.*` keys, secrets masked) to prefill the form. */
  initialSettings?: Record<string, string>
  /** Label of the primary action. Defaults to "save and activate". */
  submitLabel?: string
  /** Called after the provider was saved as active and, when testable, verified. */
  onSaved?: (event: RuntimeSavedEvent) => void
}

type FieldValues = Partial<Record<ProviderField, string>>

function initialValuesFor(provider: string, settings: Record<string, string>): FieldValues {
  const info = findRuntimeProvider(provider)
  if (!info) return {}
  const values: FieldValues = {}
  for (const field of info.fields) {
    const stored = settings[providerSettingKey(provider, field)]
    values[field] = stored || info.defaults[field] || ''
  }
  if (provider === 'anthropic' && !values.model) values.model = DEFAULT_CLAUDE_MODEL
  return values
}

function isFilled(value: string | undefined): boolean {
  return !!value && value.trim() !== ''
}

/**
 * Pick a runtime provider, edit its settings, test the connection and save it
 * as the active runtime. Shared by onboarding and /settings/runtime.
 */
export function RuntimeProviderForm({
  initialSettings = {},
  submitLabel,
  onSaved,
}: RuntimeProviderFormProps) {
  const t = useTranslations('runtime')
  const activeProvider = initialSettings['runtime.default_provider'] || STANDALONE_PROVIDER
  const [provider, setProvider] = useState(activeProvider)
  const [valuesByProvider, setValuesByProvider] = useState<Record<string, FieldValues>>(() =>
    Object.fromEntries(
      RUNTIME_PROVIDERS.map((p) => [p.id, initialValuesFor(p.id, initialSettings)]),
    ),
  )
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState<'testing' | 'saving' | null>(null)
  const [result, setResult] = useState<RuntimeTestResult | null>(null)

  const info = findRuntimeProvider(provider)
  const values = useMemo(() => valuesByProvider[provider] ?? {}, [valuesByProvider, provider])
  const isStandalone = provider === STANDALONE_PROVIDER
  const requirementMet = !info || info.requirement === 'none' || isFilled(values[info.requirement])

  function setField(field: ProviderField, value: string) {
    setValuesByProvider((prev) => ({ ...prev, [provider]: { ...prev[provider], [field]: value } }))
    setResult(null)
  }

  function selectProvider(next: string) {
    setProvider(next)
    setResult(null)
  }

  async function testConnection(): Promise<RuntimeTestResult> {
    const res = await fetch('/api/settings/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, ...values }),
    })
    return res.json()
  }

  async function handleTest() {
    setBusy('testing')
    setResult(null)
    try {
      setResult(await testConnection())
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
    setBusy(null)
  }

  async function handleSave() {
    setBusy('saving')
    setResult(null)
    try {
      const settings: Record<string, string> = { 'runtime.default_provider': provider }
      for (const field of info?.fields ?? []) {
        settings[providerSettingKey(provider, field)] = values[field] ?? ''
      }
      if (info?.usesEnabledFlag) settings[providerSettingKey(provider, 'enabled')] = 'true'

      const saveRes = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      if (!saveRes.ok) throw new Error(t('saveFailed'))

      const outcome = isStandalone ? { ok: true } : await testConnection()
      setResult(outcome)
      if (outcome.ok) onSaved?.({ provider, result: outcome })
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
    setBusy(null)
  }

  function successMessage(r: RuntimeTestResult): string {
    if (isStandalone) return t('savedStandalone')
    if (typeof r.agents_found === 'number' && info?.hostsAgents) {
      return t('connectedAgents', { count: r.agents_found })
    }
    return t('connected')
  }

  function renderField(field: ProviderField) {
    const id = `runtime-${provider}-${field}`
    const label = t.has(`providers.${provider}.${field}`)
      ? t(`providers.${provider}.${field}`)
      : t(`fields.${field}`)
    const help = t.has(`providers.${provider}.${field}Help`)
      ? t(`providers.${provider}.${field}Help`)
      : t.has(`fields.${field}Help`)
        ? t(`fields.${field}Help`)
        : null
    const value = values[field] ?? ''
    const note = field === 'token' && value === MASKED_SECRET ? t('secretStored') : null

    let control
    if (field === 'token') {
      control = (
        <div className="flex gap-2">
          <Input
            id={id}
            type={showSecret ? 'text' : 'password'}
            value={value}
            onChange={(e) => setField(field, e.target.value)}
            autoComplete="off"
          />
          <Button
            variant="secondary"
            size="md"
            onClick={() => setShowSecret(!showSecret)}
            className="shrink-0"
          >
            {showSecret ? t('hide') : t('show')}
          </Button>
        </div>
      )
    } else if (field === 'model' && provider === 'anthropic') {
      control = (
        <Select id={id} value={value} onChange={(e) => setField(field, e.target.value)}>
          {CURRENT_CLAUDE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      )
    } else if (field === 'context_sync') {
      control = (
        <Select id={id} value={value || 'push'} onChange={(e) => setField(field, e.target.value)}>
          <option value="push">{t('contextSyncPush')}</option>
          <option value="pull">{t('contextSyncPull')}</option>
        </Select>
      )
    } else if (field === 'promptMode') {
      control = (
        <Select id={id} value={value || 'arg'} onChange={(e) => setField(field, e.target.value)}>
          <option value="arg">{t('promptModeArg')}</option>
          <option value="stdin">{t('promptModeStdin')}</option>
        </Select>
      )
    } else {
      control = (
        <Input
          id={id}
          value={value}
          onChange={(e) => setField(field, e.target.value)}
          placeholder={findRuntimeProvider(provider)?.defaults[field]}
        />
      )
    }

    const required = info?.requirement === field
    return (
      <div key={field}>
        <label htmlFor={id} className="text-xs text-muted block mb-1">
          {label}
          {required && ' *'}
        </label>
        {control}
        {(note || help) && <p className="text-xs text-muted mt-1">{note ?? help}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="runtime-provider" className="text-xs text-muted block mb-1">
          {t('provider')}
        </label>
        <Select
          id="runtime-provider"
          value={provider}
          onChange={(e) => selectProvider(e.target.value)}
        >
          {RUNTIME_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {t(`providers.${p.id}.label`)}
              {p.id === activeProvider ? ` — ${t('active')}` : ''}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted mt-1">{t(`providers.${provider}.description`)}</p>
      </div>

      {info?.fields.map(renderField)}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          onClick={handleSave}
          disabled={busy !== null || !requirementMet}
        >
          {busy === 'saving' ? t('saving') : (submitLabel ?? t('saveAndActivate'))}
        </Button>
        {!isStandalone && (
          <Button
            variant="secondary"
            size="lg"
            onClick={handleTest}
            disabled={busy !== null || !requirementMet}
          >
            {busy === 'testing' ? t('testing') : t('testConnection')}
          </Button>
        )}
      </div>

      {result && (
        <p role="status" className={`text-sm ${result.ok ? 'text-ok' : 'text-alert'}`}>
          {result.ok ? successMessage(result) : result.hint || result.error || t('testFailed')}
        </p>
      )}
    </div>
  )
}
