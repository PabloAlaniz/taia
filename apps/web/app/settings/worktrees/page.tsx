'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button, Input, Checkbox } from '@/components/atoms'
import { PageHeader } from '@/components/molecules/page-header'
import { fetchJson } from '@/lib/use-resource'
import { SectionCard } from '@/components/molecules/section-card'

export default function WorktreeSettingsPage() {
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
  const [saveMessage, setSaveMessage] = useState('')

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
    setSaveMessage('')
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
        setSaveMessage('Guardado')
        setTimeout(() => setSaveMessage(''), 3000)
      } else {
        setSaveMessage(`Error: ${data.error}`)
      }
    } catch (e) {
      setSaveMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
    setSaving(false)
  }

  const inputClass =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-hidden focus:border-accent'

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="text-muted text-sm">Cargando...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Git Worktrees" backHref="/settings" />

      <div className="p-6 pt-8 max-w-2xl mx-auto space-y-8">
        {/* Paths Section */}
        <SectionCard
          title="Paths"
          description="Directorios donde se crean worktrees y clones de repositorios. Se definen en el servidor con WORKTREE_BASE_PATH y WORKTREE_REPO_PATH; desde acá solo se pueden cambiar con TAIA_ALLOW_REMOTE_COMMANDS=1."
        >
          <div>
            <label className="text-xs text-muted block mb-1">Worktree Base Path</label>
            <Input
              value={basePath}
              onChange={(e) => setBasePath(e.target.value)}
              placeholder="/tmp/taia-worktrees"
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">
              Directorio base donde se crean los worktrees. Cada worktree usa un subdirectorio con
              su ID.
            </p>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Repo Clone Path</label>
            <Input
              value={repoClonePath}
              onChange={(e) => setRepoClonePath(e.target.value)}
              placeholder="/tmp/taia-repos"
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">
              Directorio donde se clonan los repositorios para crear worktrees.
            </p>
          </div>
        </SectionCard>

        {/* Cleanup Section */}
        <SectionCard title="Cleanup" description="Limpieza automatica de worktrees inactivos.">
          <div>
            <label className="text-xs text-muted block mb-1">Horas antes de cleanup</label>
            <Input
              type="number"
              value={cleanupHours}
              onChange={(e) => setCleanupHours(e.target.value)}
              placeholder="72"
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">
              Worktrees activos por mas de este tiempo se limpian automaticamente.
            </p>
          </div>

          <Checkbox
            checked={autoCleanup}
            onChange={(e) => setAutoCleanup(e.target.checked)}
            label="Auto cleanup al mergear"
            description="Eliminar archivos del worktree automaticamente despues de merge."
          />
        </SectionCard>

        {/* Automation Section */}
        <SectionCard title="Automatizacion">
          <div>
            <label className="text-xs text-muted block mb-1">Setup Command</label>
            <Input
              value={setupCommand}
              onChange={(e) => setSetupCommand(e.target.value)}
              placeholder="npm install"
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">
              Comando a ejecutar despues de crear un worktree (ej: npm install, pnpm install). Por
              seguridad se define en el servidor con WORKTREE_SETUP_CMD; editarlo aca requiere
              TAIA_ALLOW_REMOTE_COMMANDS=1.
            </p>
          </div>

          <Checkbox
            checked={autoCreateOnAssign}
            onChange={(e) => setAutoCreateOnAssign(e.target.checked)}
            label="Crear worktree al asignar tarea"
            description="Crear automaticamente un worktree cuando se asigna una tarea a un agente."
          />
        </SectionCard>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          {saveMessage && (
            <span
              className={`text-sm ${saveMessage.startsWith('Error') ? 'text-red-500' : 'text-green-500'}`}
            >
              {saveMessage}
            </span>
          )}
          <Link
            href="/settings"
            className="text-muted px-4 py-2 text-sm no-underline hover:text-foreground"
          >
            Cancelar
          </Link>
          <Button variant="primary" size="lg" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
