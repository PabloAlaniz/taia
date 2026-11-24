'use client'

import { useFormatter, useNow, useTranslations } from 'next-intl'
import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Alert, Badge, Button, Input, Select, Strip } from '@/components/atoms'
import { EmptyState } from '@/components/molecules/empty-state'
import { PageHeader } from '@/components/molecules/page-header'
import { RackSection } from '@/components/molecules/rack-section'
import { fetchJson, useResource } from '@/lib/use-resource'

type Scope = 'admin' | 'agent'

interface AccessToken {
  id: string
  name: string
  scope: Scope
  masked: string
  status: 'active' | 'revoked' | 'expired'
  createdBy: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

const EXPIRY_OPTIONS = ['30', '90', '365', 'never'] as const

function defaultMcpUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:13336/mcp'
  return `${window.location.protocol}//${window.location.hostname}:13336/mcp`
}

function snippets(url: string, token: string) {
  return {
    claudeCode: `claude mcp add --transport http taia ${url} \\\n  --header "Authorization: Bearer ${token}"`,
    desktop: JSON.stringify(
      {
        mcpServers: {
          taia: {
            command: 'npx',
            args: ['-y', 'mcp-remote', url, '--header', 'Authorization: Bearer ${TAIA_TOKEN}'],
            env: { TAIA_TOKEN: token },
          },
        },
      },
      null,
      2,
    ),
    cli: `export TAIA_TOKEN=${token}`,
  }
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const t = useTranslations('settingsAccess')
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        <Button
          size="xs"
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? t('copied') : t('copy')}
        </Button>
      </div>
      <pre className="text-2xs font-mono bg-background rounded-sm p-2 overflow-x-auto whitespace-pre">
        {value}
      </pre>
    </div>
  )
}

export default function SettingsAccessPage() {
  const tp = useTranslations('pageTitles')
  const t = useTranslations('settingsAccess')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })

  const tokens = useResource('access-tokens', () =>
    fetchJson<{ ok: boolean; tokens: AccessToken[] }>('/api/access/tokens').then((d) => d.tokens),
  )

  const [name, setName] = useState('')
  const [scope, setScope] = useState<Scope>('agent')
  const [expiry, setExpiry] = useState<(typeof EXPIRY_OPTIONS)[number]>('90')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null)
  const [mcpUrl, setMcpUrl] = useState(defaultMcpUrl)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)

  const relative = (iso: string) =>
    format.relativeTime(new Date(Math.min(new Date(iso).getTime(), now.getTime())), now)

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/access/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          scope,
          expiresInDays: expiry === 'never' ? null : Number(expiry),
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setCreated({ token: data.token, name: data.record.name })
      setName('')
      tokens.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    setError(null)
    try {
      const res = await fetch(`/api/access/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setConfirmRevoke(null)
      tokens.reload()
    }
  }

  const list = tokens.data ?? []
  const shown = created ? snippets(mcpUrl, created.token) : null

  return (
    <div className="min-h-full bg-background">
      <PageHeader
        width="form"
        title={tp('access')}
        backHref="/settings"
        backLabel={tp('settings')}
      />
      <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto space-y-4">
        <p className="text-sm text-muted max-w-prose">{t('intro')}</p>

        {error && <Alert variant="error">{error}</Alert>}

        {created && shown && (
          <Alert variant="success">
            <div className="space-y-3 font-normal">
              <p className="font-semibold">{t('createdTitle', { name: created.name })}</p>
              <p className="text-mid">{t('createdOnce')}</p>
              <CopyBlock label={t('tokenLabel')} value={created.token} />
              <div>
                <label htmlFor="access-mcp-url" className="text-xs text-muted block mb-1">
                  {t('mcpUrlLabel')}
                </label>
                <Input
                  id="access-mcp-url"
                  value={mcpUrl}
                  onChange={(event) => setMcpUrl(event.target.value)}
                />
              </div>
              <CopyBlock label={t('snippetClaudeCode')} value={shown.claudeCode} />
              <CopyBlock label={t('snippetDesktop')} value={shown.desktop} />
              <CopyBlock label={t('snippetCli')} value={shown.cli} />
              <Button variant="secondary" onClick={() => setCreated(null)}>
                {t('done')}
              </Button>
            </div>
          </Alert>
        )}

        <RackSection id="access-create" title={t('createTitle')}>
          <form onSubmit={create} className="flex flex-col gap-3">
            <div>
              <label htmlFor="access-name" className="text-xs text-on-rack-muted block mb-1">
                {t('nameLabel')}
              </label>
              <Input
                id="access-name"
                value={name}
                maxLength={80}
                required
                placeholder={t('namePlaceholder')}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="min-w-40 flex-1">
                <label htmlFor="access-scope" className="text-xs text-on-rack-muted block mb-1">
                  {t('scopeLabel')}
                </label>
                <Select
                  id="access-scope"
                  value={scope}
                  onChange={(event) => setScope(event.target.value as Scope)}
                >
                  <option value="agent">{t('scope.agent')}</option>
                  <option value="admin">{t('scope.admin')}</option>
                </Select>
              </div>
              <div className="min-w-40 flex-1">
                <label htmlFor="access-expiry" className="text-xs text-on-rack-muted block mb-1">
                  {t('expiryLabel')}
                </label>
                <Select
                  id="access-expiry"
                  value={expiry}
                  onChange={(event) =>
                    setExpiry(event.target.value as (typeof EXPIRY_OPTIONS)[number])
                  }
                >
                  {EXPIRY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === 'never' ? t('expiryNever') : t('expiryDays', { days: option })}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <p className="text-mid text-on-rack-muted">{t(`scopeHint.${scope}`)}</p>
            <div>
              <Button type="submit" variant="primary" disabled={creating || !name.trim()}>
                {creating ? t('creating') : t('create')}
              </Button>
            </div>
          </form>
        </RackSection>

        <RackSection
          id="access-tokens"
          title={t('listTitle')}
          aside={<span role="status">{tokens.loading ? t('loading') : null}</span>}
        >
          {tokens.error && <Alert variant="error">{t('loadFailed')}</Alert>}
          {!tokens.loading && list.length === 0 && !tokens.error && (
            <EmptyState
              onRack
              className="py-4 px-0"
              icon={<KeyRound size={20} aria-hidden="true" />}
              title={t('empty')}
            />
          )}
          {list.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {list.map((token) => (
                <li key={token.id}>
                  <Strip className="py-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-semibold">{token.name}</span>
                      <Badge variant={token.scope === 'admin' ? 'warning' : 'muted'}>
                        {t(`scope.${token.scope}`)}
                      </Badge>
                      {token.status !== 'active' && (
                        <Badge variant="danger">{t(`status.${token.status}`)}</Badge>
                      )}
                      <span className="ml-auto">
                        {token.status === 'active' &&
                          (confirmRevoke === token.id ? (
                            <span className="flex gap-1.5">
                              <Button size="xs" variant="danger" onClick={() => revoke(token.id)}>
                                {t('revokeConfirm')}
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => setConfirmRevoke(null)}
                              >
                                {t('cancel')}
                              </Button>
                            </span>
                          ) : (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => setConfirmRevoke(token.id)}
                            >
                              {t('revoke')}
                            </Button>
                          ))}
                      </span>
                    </div>
                    <div className="text-mid text-muted flex flex-wrap gap-x-2">
                      <span className="font-mono">{token.masked}</span>
                      <span>· {t('createdAt', { when: relative(token.createdAt) })}</span>
                      <span>
                        ·{' '}
                        {token.lastUsedAt
                          ? t('lastUsed', { when: relative(token.lastUsedAt) })
                          : t('neverUsed')}
                      </span>
                      {token.expiresAt && token.status === 'active' && (
                        <span>
                          ·{' '}
                          {t('expiresOn', {
                            date: format.dateTime(new Date(token.expiresAt), {
                              dateStyle: 'medium',
                            }),
                          })}
                        </span>
                      )}
                    </div>
                  </Strip>
                </li>
              ))}
            </ul>
          )}
        </RackSection>
      </div>
    </div>
  )
}
