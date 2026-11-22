'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button, Input, Checkbox } from '@/components/atoms'
import { PageHeader } from '@/components/molecules/page-header'
import { fetchJson } from '@/lib/use-resource'
import { SectionCard } from '@/components/molecules/section-card'

export default function WorktreeSettingsPage() {
  const tp = useTranslations('pageTitles')
  const t = useTranslations('settingsWorktrees')
  const tc = useTranslations('settingsCommon')
  const tCommon = useTranslations('common')
  const [basePath, setBasePath] = useState('/tmp/taia-worktrees')
  const [repoClonePath, setRepoClonePath] = useState('/tmp/taia-repos')
  const [cleanupHours, setCleanupHours] = useState('72')
  const [setupCommand, setSetupCommand] = useState('')
  const [savedSetupCommand, setSavedSetupCommand] = useState('')
  const [savedPaths, setSavedPaths] = useState({ basePath: '', repoClonePath: '' })
  const [autoCleanup, setAutoCleanup] = useState(true)
  const [autoCreateOnAssign, setAutoCreateOnAssign] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetchJson<{ ok: boolean; settings: Record<string, string> }>('/api/settings?prefix=worktree.')
      .then((data) => {
        if (!data.ok) return
        const s = data.settings
        if (s['worktree.base_path']) setBasePath(s['worktree.base_path'])
        if (s['worktree.repo_clone_path']) setRepoClonePath(s['worktree.repo_clone_path'])
        setSavedPaths({
          basePath: s['worktree.base_path'] || '/tmp/taia-worktrees',
          repoClonePath: s['worktree.repo_clone_path'] || '/tmp/taia-repos',
        })
        if (s['worktree.cleanup_hours']) setCleanupHours(s['worktree.cleanup_hours'])
        if (s['worktree.setup_command'] != null) {
          setSetupCommand(s['worktree.setup_command'])
          setSavedSetupCommand(s['worktree.setup_command'])
        }
        if (s['worktree.auto_cleanup'] != null)
          setAutoCleanup(s['worktree.auto_cleanup'] !== 'false')
        if (s['worktree.auto_create_on_assign'] != null)
          setAutoCreateOnAssign(s['worktree.auto_create_on_assign'] === 'true')
      })
      .catch((e) => console.error('Failed to fetch settings:', e))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            'worktree.cleanup_hours': cleanupHours,
            // Only sent when edited: the server refuses paths and commands
            // unless TAIA_ALLOW_REMOTE_COMMANDS=1, and that shouldn't block
            // saving the other fields.
            ...(basePath !== savedPaths.basePath ? { 'worktree.base_path': basePath } : {}),
            ...(repoClonePath !== savedPaths.repoClonePath
              ? { 'worktree.repo_clone_path': repoClonePath }
              : {}),
            ...(setupCommand !== savedSetupCommand
              ? { 'worktree.setup_command': setupCommand }
              : {}),
            'worktree.auto_cleanup': String(autoCleanup),
            'worktree.auto_create_on_assign': String(autoCreateOnAssign),
          },
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setSavedSetupCommand(setupCommand)
        setSavedPaths({ basePath, repoClonePath })
        setSaveMessage({ ok: true, text: tc('saved') })
        setTimeout(() => setSaveMessage(null), 3000)
      } else {
        setSaveMessage({ ok: false, text: tc('saveFailed', { error: String(data.error) }) })
      }
    } catch (e) {
      setSaveMessage({
        ok: false,
        text: tc('saveFailed', { error: e instanceof Error ? e.message : String(e) }),
      })
    }
    setSaving(false)
  }

  const inputClass =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-hidden focus:border-accent'

  if (loading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <span className="text-muted text-sm" role="status">
          {tc('loadingPage')}
        </span>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <PageHeader
        width="form"
        title={tp('worktrees')}
        backHref="/settings"
        backLabel={tp('settings')}
      />

      <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto space-y-8">
        {/* Paths Section */}
        <SectionCard title={t('pathsTitle')} description={t('pathsDesc')}>
          <div>
            <label htmlFor="worktree-base-path" className="text-xs text-muted block mb-1">
              {t('basePathLabel')}
            </label>
            <Input
              id="worktree-base-path"
              value={basePath}
              onChange={(e) => setBasePath(e.target.value)}
              placeholder="/tmp/taia-worktrees"
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">{t('basePathHelp')}</p>
          </div>

          <div>
            <label htmlFor="worktree-repo-path" className="text-xs text-muted block mb-1">
              {t('repoPathLabel')}
            </label>
            <Input
              id="worktree-repo-path"
              value={repoClonePath}
              onChange={(e) => setRepoClonePath(e.target.value)}
              placeholder="/tmp/taia-repos"
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">{t('repoPathHelp')}</p>
          </div>
        </SectionCard>

        {/* Cleanup Section */}
        <SectionCard title={t('cleanupTitle')} description={t('cleanupDesc')}>
          <div>
            <label htmlFor="worktree-cleanup-hours" className="text-xs text-muted block mb-1">
              {t('cleanupHoursLabel')}
            </label>
            <Input
              id="worktree-cleanup-hours"
              type="number"
              value={cleanupHours}
              onChange={(e) => setCleanupHours(e.target.value)}
              placeholder="72"
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">{t('cleanupHoursHelp')}</p>
          </div>

          <Checkbox
            checked={autoCleanup}
            onChange={(e) => setAutoCleanup(e.target.checked)}
            label={t('autoCleanupLabel')}
            description={t('autoCleanupHelp')}
          />
        </SectionCard>

        {/* Automation Section */}
        <SectionCard title={t('automationTitle')}>
          <div>
            <label htmlFor="worktree-setup-command" className="text-xs text-muted block mb-1">
              {t('setupCommandLabel')}
            </label>
            <Input
              id="worktree-setup-command"
              value={setupCommand}
              onChange={(e) => setSetupCommand(e.target.value)}
              placeholder="npm install"
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">{t('setupCommandHelp')}</p>
          </div>

          <Checkbox
            checked={autoCreateOnAssign}
            onChange={(e) => setAutoCreateOnAssign(e.target.checked)}
            label={t('autoCreateLabel')}
            description={t('autoCreateHelp')}
          />
        </SectionCard>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          {saveMessage && (
            <span role="status" className={`text-sm ${saveMessage.ok ? 'text-ok' : 'text-alert'}`}>
              {saveMessage.text}
            </span>
          )}
          <Link
            href="/settings"
            className="text-muted px-4 py-2 text-sm no-underline hover:text-foreground"
          >
            {tCommon('cancel')}
          </Link>
          <Button variant="primary" size="lg" onClick={handleSave} disabled={saving}>
            {saving ? tc('saving') : tc('saveChanges')}
          </Button>
        </div>
      </div>
    </div>
  )
}
