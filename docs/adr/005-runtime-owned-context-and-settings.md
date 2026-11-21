# ADR-005: Proyección de contexto y settings de runtime a cargo del adapter

**Estado**: Aceptado
**Fecha**: 2026-10-26
**Enmienda**: [ADR-003](./003-agent-context-bundle.md), decisión 2 (tabla `agent_files`)

## Contexto

ADR-003 definió el Agent Context Bundle (5 capas) con `agent_context` como fuente de verdad y `agent_files` como "proyección OpenClaw". En la práctica:

- **La proyección vive en core y se escribe para cualquier runtime.** `setup.service` genera `SOUL.md`/`HEARTBEAT.md` con plantillas que incluyen la API de TAIA y las guarda en `agent_files` aunque el runtime activo sea Anthropic o un CLI.
- **Se desincroniza.** Editar el contexto (`PATCH /api/agents/:id/context`) no re-proyecta; el enrichment escribe `SOUL.md` pero no la identidad tipada; setup guarda el `SOUL.md` completo como `persona`, y al re-renderizar se anida el boilerplate.
- **El modelo de OpenClaw cambió** (ver [ADR-004](./004-openclaw-gateway-protocol-v4.md)): los archivos de workspace son `SOUL.md` (persona y límites), `IDENTITY.md` (nombre, emoji), `AGENTS.md` (instrucciones operativas), `USER.md` (modelo del usuario) y `MEMORY.md` (memoria del agente). `HEARTBEAT.md` ya no existe: el heartbeat es un job de cron. Y el gateway permite **escribir** esos archivos (`agents.files.set` con `expectedHash`), así que no hace falta que el agente los descargue por HTTP.
- **La config de runtime tiene la forma de `openclaw.json`.** `RuntimeConfig` (`agents.defaults.model`, `agents.list[].tools.deny`) es el documento de OpenClaw tipado a medias, consumido por setup, `/api/models` y `/api/agents/config`. Ningún otro runtime puede implementarlo.
- **El mensaje de heartbeat es de OpenClaw y se manda a todos.** `getHeartbeatMessage` le pide al agente que descargue su `HEARTBEAT.md` y responda `HEARTBEAT_OK`, también a Anthropic, que ya recibe el bundle.

## Decisión

**Principio: core versiona y despacha; los adapters renderizan y aplican.** Core no genera markdown ni conoce `openclaw.json`.

### 1. Fuentes de verdad

| Concepto | Fuente de verdad | Quién la escribe | Quién la consume |
|---|---|---|---|
| Identidad, proyecto, usuario | `agent_context` + tablas `*_versions` (ADR-003) | Solo `agent-context.service` | Renderer de cada adapter |
| Capa de tarea | `tasks`, `worktrees`, nueva `agent_working_state` | Servicios de tareas/worktrees, UI, agentes vía API | Renderer de cada adapter |
| Memoria del agente | `agent_memory` (absorbe los `memory/*.md`) | El agente (memory tool), la ruta HTTP de memoria | Memory tool de Anthropic; ruta HTTP |
| Archivos nativos (`SOUL.md`, `AGENTS.md`…) | **Ninguna**: se renderizan al vuelo | — | `openclaw/context-renderer.ts` |
| Estado de sincronización | nueva `agent_context_sync (agent_id, provider)` | `context-sync.service` | Core, UI |
| Settings de runtime por agente (deseados) | nueva `agent_runtime_settings` (`null` = heredar) | `agent-runtime-settings.service` | Mappers del adapter |
| Settings observados | El runtime | — | `getRuntimeSettings()` |
| Documento nativo de config | El runtime | Solo vía escape explícito | Capability `NativeConfig` |

`agent_files` queda **retirada**: ningún código la lee ni la escribe, y el esquema base de la primera versión pública ya no la incluye.

### 2. Capabilities nuevas

- **`ContextSync`** — `projectAgentContext(bundle)` (render puro a archivos) y `syncAgentContext(request)` (push idempotente con hashes; detecta conflictos si el agente editó un archivo). OpenClaw la implementa; Anthropic no la necesita (renderiza en cada spawn); los CLIs renderizan el bundle dentro del prompt.
- **`RuntimeSettingsRead`** — `getRuntimeSettings()`: defaults y settings por agente en forma neutral.
- **`AgentProvisioning`** — `provisionAgent`, `updateAgentSettings`, `deprovisionAgent`, `setRuntimeDefaults`.
- **`NativeConfig`** — `getNativeConfig` / `patchNativeConfig`: passthrough opaco (`unknown`), solo para la vista avanzada de config.

`ConfigRead`, `ConfigWrite`, `RuntimeConfig*`, `getAgentConfigs` y `patchRuntimeConfig` quedaron eliminados.

Los settings deseados se guardan como valores (`null` = heredar) y los cambios viajan al runtime como *updates*: un valor fija el campo, `null` lo vuelve al default del runtime y un campo omitido no se toca, así TAIA nunca pisa lo que no administra. `provisionAgent` no modifica un agente que ya existe. Los runtimes sin `AgentProvisioning` reciben el modelo del agente al lanzar cada sesión (`SpawnOptions.model`) y lo aplican si pueden.

### 3. Tipos neutrales

- `ModelSelection { primary, fallbacks }` con referencias canónicas `provider/model`.
- `AgentRuntimeSettings { model?, deniedTools?, workspace? }`, `RuntimeDefaults`.
- `SpawnOptions.trigger: { kind: 'heartbeat' | 'task' | 'prompt' }`: el adapter arma el mensaje de arranque con su renderer; core manda un texto neutral de respaldo, sin URLs.
- `TaskBriefing.workspace` (worktree tipado) en lugar de concatenar texto al prompt.

### 4. Mapeo OpenClaw

| Bundle | Archivo |
|---|---|
| `agent.persona`, `agent.constraints` | `SOUL.md` |
| `agent.name`, `agent.role` | `IDENTITY.md` |
| `agent.instructions` + uso de la API de TAIA + rutina de heartbeat | `AGENTS.md` |
| `user` | `USER.md` |
| `memory` | `MEMORY.md` lo escribe el agente: **TAIA nunca lo empuja** |

Push con `agents.files.set` + `expectedHash`; si el agente editó un archivo de TAIA, el resultado es `conflict` y no se pisa (salvo `force`). Detrás del flag `runtime.providers.openclaw.context_sync` hasta validarlo en uso real.

### 5. Preparado para runtime por agente

Todo se resuelve con `getRuntimeAdapterForAgent(agentId)` (hoy devuelve el singleton). El ledger de sync y los settings están indexados por agente, así que pasar a un adapter por agente solo cambia esa función (ver ADR-006).

### 6. Guardarraíl de arquitectura

Regla de dependency-cruiser `runtime-no-core`: `packages/runtime` no puede importar `core`, `domain` ni apps.

## Consecuencias

- Una sola forma de editar el contexto (servicio tipado), que dispara la sincronización para todos los runtimes.
- El agente de OpenClaw recibe sus archivos actualizados sin tener que descargarlos; los agentes de Anthropic y CLI reciben el worktree tipado (hoy Anthropic lo pierde).
- La UI deja de editar markdown generado y pasa a editar campos tipados.
- Migraciones de datos: backfill y normalización de identidades, `WORKING.md` → `agent_working_state`, `memory/*.md` → `agent_memory`.
