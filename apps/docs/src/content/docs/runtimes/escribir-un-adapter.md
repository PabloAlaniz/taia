---
title: Escribir un adapter
description: Integrar un runtime nuevo implementando AgentRuntimeAdapter.
sidebar:
  order: 9
---

Un adapter es una clase TypeScript que implementa la interfaz `AgentRuntimeAdapter` de `@taia/runtime`. Antes de empezar, conviene leer la [visión general de la arquitectura](/taia/arquitectura/vision-general/).

Un adapter tiene tres responsabilidades:

1. Hablar con el runtime (HTTP, WebSocket, subproceso…).
2. Traducir los tipos del runtime a los **tipos canónicos** de TAIA (`RuntimeAgent`, `RuntimeSession`, `RuntimeMessage`, `RuntimeCronJob`, `RuntimeHealth`).
3. Declarar sus **capacidades**.

Nada más. La lógica de tareas, workspaces, costos o alertas vive en `@taia/core`.

## 1. Estructura

```
packages/runtime/src/adapters/<runtime>/
├── index.ts      # exports y registro del factory
├── adapter.ts    # class MyAdapter implements AgentRuntimeAdapter
├── client.ts     # transporte
├── mappers.ts    # forma nativa → forma canónica
└── types.ts      # tipos del protocolo (internos)
```

Los adapters de CLI comparten `GenericCliProtocol` (`adapters/cli/`); para un CLI nuevo, conviene partir de `adapters/aider/`.

## 2. La superficie mínima

```ts
import {
  CapabilitySet,
  RuntimeCapability,
  type AgentRuntimeAdapter,
  type RuntimeAgent,
  type RuntimeConnectionState,
  type RuntimeConnectionTest,
  type RuntimeHealth,
} from '@taia/runtime'

export class MyAdapter implements AgentRuntimeAdapter {
  readonly id = 'my-runtime'
  readonly capabilities = new CapabilitySet([
    RuntimeCapability.Sessions,
    RuntimeCapability.Health,
    // solo lo que de verdad implementás
  ])

  async isAvailable(): Promise<boolean> { /* … */ }
  getConnectionState(): RuntimeConnectionState { /* … */ }
  onConnectionStateChange(handler: (state: RuntimeConnectionState) => void): () => void { /* … */ }
  async listAgents(): Promise<RuntimeAgent[]> { /* … */ }
  async getHealth(): Promise<RuntimeHealth> { /* … */ }

  // Opcional, pero recomendado: lo usa "Probar conexión". Nunca lanza:
  // devuelve { ok: false, reason, error }. Sin él, TAIA usa getHealth().
  async testConnection(): Promise<RuntimeConnectionTest> { /* … */ }
}
```

Las sesiones que devuelve `listSessions` tienen que traer `agentId` (el agente de TAIA dueño de la sesión): TAIA agrupa por ese campo.

## 3. Métodos por capacidad

**Si declarás una capacidad, tenés que implementar sus métodos.** Si no la declarás, no los implementes.

| Capacidad | Métodos |
|---|---|
| `Sessions` | `spawnSession`, `listSessions` (`awaitSessionComplete` y `sendToSession`, opcionales) |
| `Transcripts` | `getSessionHistory` |
| `Cron` | `listCrons`, `cronAction` |
| `LiveEvents` | `on(event, handler)` |
| `Approvals` | flujo de aprobaciones del runtime (ver el adapter de Anthropic) |
| `Messaging` | `sendChannelMessage({ channel, target, text })` |
| `ContextSync` | `projectAgentContext(bundle)`, `syncAgentContext(request)`, para runtimes que guardan el contexto como archivos ([ADR-005](/taia/arquitectura/adr/005-runtime-owned-context-and-settings/)) |
| `RuntimeSettingsRead` | `getRuntimeSettings()` |
| `AgentProvisioning` | `provisionAgent`, `updateAgentSettings`, `deprovisionAgent` (`setRuntimeDefaults`, opcional). `provisionAgent` no toca un agente que ya existe y nunca lanza: los errores vuelven como `{ status: 'failed', manualHint }`. En `updateAgentSettings`, `null` vuelve un campo al default del runtime |
| `NativeConfig` | `getNativeConfig`, `patchNativeConfig` |

## 4. Tipos canónicos

Los métodos públicos nunca devuelven la forma nativa del runtime: la traducción va en `mappers.ts`. Los nombres canónicos no se negocian: `sessionKey` (no `childSessionKey`), `runId`, `agentId`.

Si el runtime tiene convenciones de filesystem (una raíz de workspaces, por ejemplo), descríbelas con `getProviderDefaults()`. El core nunca arma rutas del runtime: cuando provisiona un agente sin workspace, el runtime elige uno.

## 5. Contexto del agente

Si declarás `Sessions`, tenés que traducir el `AgentContextBundle` (capas `agent`, `project`, `user`, `task`, `memory`) a lo que el runtime entiende:

- `context-renderer.ts` implementa `AgentContextRenderer`. Recibe `RenderOptions.trigger` (`heartbeat`, `task` o `prompt`) y arma con eso el primer mensaje. Los bloques de markdown compartidos están en `context-markdown.ts`.
- Si el runtime guarda el contexto en archivos, declará `ContextSync`. `projectAgentContext` renderiza los archivos con sus hashes y `syncAgentContext` los escribe, sin pisar un archivo que el agente cambió salvo que se fuerce.
- Si el runtime tiene herramientas propias, mapeá las capacidades del agente (`read_tasks`, etc.) a esas herramientas, como hace `adapters/anthropic/capabilities.ts`.

Ejemplos: OpenClaw (archivos), Anthropic (bloques de system prompt) y los CLI (un solo prompt). Ver [Modelo de contexto](/taia/arquitectura/modelo-de-contexto/).

## 6. Registrarlo en TAIA

1. **Factory**, en `index.ts`:

   ```ts
   import { registerRuntimeFactory, type RuntimeProviderConfig } from '../../registry'
   import { MyAdapter } from './adapter'

   registerRuntimeFactory('my-runtime', (config: RuntimeProviderConfig) => new MyAdapter(/* … */))
   ```

2. **Export** del subpath en `packages/runtime/package.json` (`"./adapters/my-runtime": "./src/adapters/my-runtime/index.ts"`).
3. **Import** del módulo en `packages/core/src/runtime.ts`, junto a los demás adapters (el import registra el factory).
4. **Provider** en `RUNTIME_PROVIDERS` (`packages/runtime/src/providers.ts`): qué campos pide, cuál es obligatorio y los defaults. Si es un CLI, declará `commands` con los binarios permitidos.
5. **Labels** de la UI en `apps/web/messages/es.json` y `pt.json` (`runtime.providers.<id>`).

## 7. Tests de contrato

```ts
// packages/runtime/__tests__/contract/my-runtime.contract.test.ts
import { runAdapterContract } from './adapter-contract'
import { MyAdapter } from '@taia/runtime/adapters/my-runtime'

runAdapterContract({ name: 'MyAdapter', makeAdapter: () => new MyAdapter(/* fixture */) })
```

Verifica los invariantes de todo adapter: nombres canónicos, coherencia entre capacidades y métodos, `getHealth` que no lanza. El adapter mínimo que lo pasa es `packages/runtime/__tests__/contract/mock-adapter.ts`; conviene leerlo antes de escribir el propio.

## Errores

| Situación | Qué hacer |
|---|---|
| Falla de red en un método de lectura | Lanzar: el core decide si cae a los datos de la base |
| `getHealth` no llega al runtime | Devolver `{ ok: false }`, nunca lanzar |
| Falla al crear o enviar una sesión | Lanzar con un mensaje que nombre la operación |
| Timeout en `awaitSessionComplete` | Lanzar `Error('awaitSessionComplete: timeout')` |

## Qué no asumir

- **Que hay una URL.** El runtime puede ser un subproceso. `RuntimeProviderConfig` acepta campos propios; documentalos.
- **Que hay cron.** Si no lo tiene, no declares `Cron`.
- **Que el adapter escribe en la base.** Los adapters nunca tocan las tablas de TAIA: devuelven datos y el core decide qué guardar.
- **Que hay lógica de negocio en el adapter.** Si te encontrás programando tareas o columnas ahí, frená y repensalo.

## Checklist del PR

- [ ] El adapter vive en `packages/runtime/src/adapters/<runtime>/` y no importa `@taia/core`, `@taia/domain` ni `@taia/web`.
- [ ] Los métodos públicos devuelven tipos canónicos.
- [ ] Las capacidades declaradas coinciden con los métodos implementados.
- [ ] `getHealth` nunca lanza.
- [ ] Factory, export, import en core, `RUNTIME_PROVIDERS` y labels (paso 6).
- [ ] `__tests__/contract/<runtime>.contract.test.ts` pasa.
- [ ] Hay una página en `apps/docs/src/content/docs/runtimes/` y una columna en la matriz de capacidades.
