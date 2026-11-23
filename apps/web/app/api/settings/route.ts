import { NextRequest, NextResponse } from 'next/server'
import { deleteSetting, getSetting, getSettings, setSetting } from '@taia/core/db'
import { applyProviderSetting, getDefaultInstanceConfig } from '@taia/core/runtime-instances'
import { disposeRuntimeAdapter } from '@taia/core/runtime'
import {
  cliCommandEnvKey,
  REMOTE_COMMANDS_DISABLED_MESSAGE,
  REMOTE_PATHS_DISABLED_MESSAGE,
  remoteCommandsAllowed,
  resolveCliCommand,
} from '@taia/core/command-policy'
import {
  isSensitiveSettingKey,
  recordSettingsAuditEvent,
} from '@taia/core/services/settings-audit.service'
import { outgoingEndpointsProblem } from '@taia/core/services/outgoing-webhook.service'

export const dynamic = 'force-dynamic'

// GET /api/settings?prefix=runtime.&reveal=key1,key2
export async function GET(request: NextRequest) {
  const prefix = request.nextUrl.searchParams.get('prefix') || undefined
  const revealParam = request.nextUrl.searchParams.get('reveal') || ''
  const revealKeys = revealParam ? revealParam.split(',') : []
  const settings = await getSettings(prefix)
  const config = await getDefaultInstanceConfig()

  const settingsMap: Record<string, string> = {}
  for (const s of settings) {
    // Mask sensitive values unless explicitly revealed. Runtime device
    // credentials (private keys, issued device tokens) are never revealed.
    const revealable = revealKeys.includes(s.key) && !s.key.includes('.device_')
    if (isSensitiveSettingKey(s.key) && !revealable) {
      settingsMap[s.key] = s.value ? '********' : ''
    } else {
      settingsMap[s.key] = s.value
    }
  }

  return NextResponse.json({
    ok: true,
    settings: settingsMap,
    configured: config.configured,
    effectiveUrl: config.url,
  })
}

const OUTGOING_ENDPOINTS_KEY = /^webhooks\.outgoing\..+\.endpoints$/

/**
 * Outgoing webhook endpoints are checked before they are saved: a bad URL or
 * a secret that cannot sign would otherwise only show up as failed deliveries.
 * A masked value ("********") is left alone, as for any sensitive setting.
 */
function invalidWebhookEndpoints(settings: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(settings)) {
    if (!OUTGOING_ENDPOINTS_KEY.test(key) || typeof value !== 'string') continue
    if (value === '********' || value === '') continue
    const problem = outgoingEndpointsProblem(value)
    if (problem) return problem
  }
  return null
}

// PUT /api/settings - bulk upsert
const CLI_COMMAND_KEY = /^runtime\.providers\.([a-z0-9][a-z0-9_-]*)\.command$/

/** Settings that hold a shell command the server runs (command-policy.ts). */
const REMOTE_COMMAND_KEYS = new Set(['worktree.setup_command'])

/** Settings that choose a directory the server writes to (command-policy.ts). */
const REMOTE_PATH_KEYS = new Set(['worktree.base_path', 'worktree.repo_clone_path'])

/**
 * Authentication is optional (TAIA_API_TOKEN), so settings can't make the
 * server run an arbitrary program or write to an arbitrary directory
 * (command-policy.ts). Returns the error for the first refused setting, or
 * null.
 */
function refusedCommand(settings: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(settings)) {
    if (REMOTE_PATH_KEYS.has(key) && typeof value === 'string' && value.trim()) {
      if (!remoteCommandsAllowed()) return REMOTE_PATHS_DISABLED_MESSAGE
      continue
    }
    if (REMOTE_COMMAND_KEYS.has(key) && typeof value === 'string' && value.trim()) {
      if (!remoteCommandsAllowed()) return REMOTE_COMMANDS_DISABLED_MESSAGE
      continue
    }
    const provider = CLI_COMMAND_KEY.exec(key)?.[1]
    if (!provider || typeof value !== 'string' || !value.trim()) continue
    if (resolveCliCommand(provider, value).rejected) {
      return `Comando no permitido para ${provider}: usá su binario o definí ${cliCommandEnvKey(provider)} en el servidor.`
    }
  }
  return null
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { settings, workspace_id, actor, origin } = body
    const auditWorkspaceId =
      typeof workspace_id === 'string'
        ? workspace_id
        : request.headers.get('x-taia-workspace-id') || 'ws-default'
    let touchedRuntimeConfig = false

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ ok: false, error: 'settings object required' }, { status: 400 })
    }

    const refused = refusedCommand(settings) ?? invalidWebhookEndpoints(settings)
    if (refused) return NextResponse.json({ ok: false, error: refused }, { status: 400 })

    for (const [key, value] of Object.entries(settings)) {
      if (typeof value !== 'string') continue
      // Skip unchanged masked sensitive values
      if (isSensitiveSettingKey(key) && value === '********') {
        await recordSettingsAuditEvent({
          workspaceId: auditWorkspaceId,
          settingKey: key,
          operation: 'update',
          actor: actor || request.headers.get('x-taia-actor') || 'web-ui',
          origin: origin || request.headers.get('x-taia-origin') || 'settings-api',
          result: 'skipped',
          message: 'masked sensitive value left unchanged',
        })
        continue
      }
      const before = await getSetting(key)
      await setSetting(key, value)
      if (await applyProviderSetting(key, value)) touchedRuntimeConfig = true
      await recordSettingsAuditEvent({
        workspaceId: auditWorkspaceId,
        settingKey: key,
        operation: before === null ? 'create' : 'update',
        actor: actor || request.headers.get('x-taia-actor') || 'web-ui',
        origin: origin || request.headers.get('x-taia-origin') || 'settings-api',
        result: 'success',
      })
    }

    if (touchedRuntimeConfig) disposeRuntimeAdapter()

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

// DELETE /api/settings - revoke keys/settings without exposing their values
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { keys, workspace_id, actor, origin } = body
    const auditWorkspaceId =
      typeof workspace_id === 'string'
        ? workspace_id
        : request.headers.get('x-taia-workspace-id') || 'ws-default'

    if (!Array.isArray(keys)) {
      return NextResponse.json({ ok: false, error: 'keys array required' }, { status: 400 })
    }

    const deleted: string[] = []
    let touchedRuntimeConfig = false
    for (const key of keys) {
      if (typeof key !== 'string') continue
      const ok = await deleteSetting(key)
      if (ok) deleted.push(key)
      if (await applyProviderSetting(key, null)) touchedRuntimeConfig = true
      await recordSettingsAuditEvent({
        workspaceId: auditWorkspaceId,
        settingKey: key,
        operation: 'revoke',
        actor: actor || request.headers.get('x-taia-actor') || 'web-ui',
        origin: origin || request.headers.get('x-taia-origin') || 'settings-api',
        result: ok ? 'success' : 'skipped',
        message: ok ? null : 'setting not found',
      })
    }

    if (touchedRuntimeConfig) disposeRuntimeAdapter()

    return NextResponse.json({ ok: true, deleted })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
