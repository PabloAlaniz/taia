// Shared handler for the runtime connection-test routes.

import { NextResponse } from 'next/server'
import type { RuntimeConnectionTest, RuntimeProviderName } from '@taia/runtime'
import { getDefaultInstanceConfig } from '@taia/core/runtime-instances'
import {
  testRuntimeConnection,
  type ConnectionOverrides,
} from '@taia/core/services/runtime-connection.service'

const MASKED_SECRET = '********'

export interface TestConnectionBody {
  provider?: RuntimeProviderName
  url?: string
  token?: string
  /** Alias of `token` for API-key providers. */
  apiKey?: string
  model?: string
  command?: string
  cwd?: string
}

function secret(value: string | undefined): string | undefined {
  return !value || value === MASKED_SECRET ? undefined : value
}

function overridesFrom(body: TestConnectionBody): ConnectionOverrides {
  return {
    url: body.url || undefined,
    token: secret(body.token) ?? secret(body.apiKey),
    model: body.model || undefined,
    command: body.command || undefined,
    cwd: body.cwd || undefined,
  }
}

function hintFor(provider: RuntimeProviderName, result: RuntimeConnectionTest): string | undefined {
  switch (result.reason) {
    case 'unreachable':
      return `No se puede conectar con ${provider}. Verificá la URL y que el runtime esté corriendo.`
    case 'unauthorized':
      return 'Credenciales inválidas. Verificá el token o la API key.'
    case 'pairing_required':
      return typeof result.details?.requestId === 'string'
        ? `El runtime pide aprobar este dispositivo. En OpenClaw: openclaw devices approve ${result.details.requestId} (o desde la Control UI), y probá de nuevo.`
        : 'El runtime pide aprobar este dispositivo. Aprobalo en OpenClaw y probá de nuevo.'
    case 'not_found':
      return typeof result.details?.model === 'string'
        ? `El modelo "${result.details.model}" no existe o no está disponible para tu cuenta.`
        : 'El runtime no expone el recurso esperado. Verificá la versión instalada.'
    case 'misconfigured':
      return 'Completá la configuración del runtime antes de probar la conexión.'
    default:
      return undefined
  }
}

/**
 * Test a runtime provider's connection. `provider` (argument, then body)
 * defaults to the default instance's; omitted or masked fields fall back to
 * the stored settings of the instance named after the provider, which is the
 * one the settings form edits until instances get their own UI (E3).
 */
export async function handleTestConnection(
  body: TestConnectionBody,
  provider?: RuntimeProviderName,
): Promise<NextResponse> {
  const target = provider ?? body.provider ?? (await getDefaultInstanceConfig()).provider
  const result = await testRuntimeConnection(
    { provider: target, instanceId: target },
    overridesFrom(body),
  )
  return NextResponse.json({
    ok: result.ok,
    provider: target,
    ...(result.agents !== undefined ? { agents_found: result.agents } : {}),
    ...(typeof result.details?.model === 'string' ? { model: result.details.model } : {}),
    ...(result.ok
      ? {}
      : { error: result.error, reason: result.reason, hint: hintFor(target, result) }),
  })
}
