---
title: Modelo de contexto
description: Cómo TAIA describe a cada agente y cómo cada runtime lo recibe.
---

**Resumen:** Cada agente en TAIA tiene un `AgentContextBundle` tipado con cinco capas (`agent`, `project`, `user`, `task`, `memory`). Cada `AgentRuntimeAdapter` implementa un `AgentContextRenderer` que traduce el bundle a su formato nativo. Los archivos que ve OpenClaw (`SOUL.md`, `IDENTITY.md`, `AGENTS.md`, `USER.md`) son una **proyección** que el adapter arma al vuelo; nunca son la fuente de verdad ([ADR-005](/taia/arquitectura/adr/005-runtime-owned-context-and-settings/)).

La justificación de las decisiones de diseño está en [ADR-003](/taia/arquitectura/adr/003-agent-context-bundle/).


## Las cinco capas

```ts
interface AgentContextBundle {
  agent:   AgentIdentity      // QUIÉN es el agente
  project: ProjectContext     // QUÉ sabe del dominio
  user:    UserProfile        // CON QUIÉN habla
  task:    TaskBriefing       // QUÉ tiene que hacer ahora
  memory:  SessionMemory      // QUÉ pasó antes
}
```

### `AgentIdentity` — quién es

```ts
interface AgentIdentity {
  id: string
  name: string
  role: string                // "Reviewer", "Planning", etc.
  persona: string             // backstory, tono — estable, cacheable
  instructions: string        // cómo trabaja — editable seguido
  capabilities: AgentCapability[]
  constraints?: string[]
}
```

`persona` cambia raro (la "esencia" del agente). `instructions` se edita seguido (cómo aborda tareas). La separación habilita que `persona` sea bloque cacheable y `instructions` sea editable sin invalidar caché de los demás agentes.

### `ProjectContext` — qué sabe del dominio

```ts
interface ProjectContext {
  id: string
  name: string
  description: string
  glossary?: Record<string, string>
  knowledgeRefs?: KnowledgeRef[]
}

interface KnowledgeRef {
  kind: 'url' | 'doc' | 'vector_store' | 'file'
  uri: string
  description: string
  cacheable: boolean
}
```

Vive en tabla `projects`. La capa sale del **proyecto de la tarea en curso**: un mismo agente recibe el contexto de un proyecto u otro según la tarea que trabaja. Si la tarea no tiene proyecto, se usa la versión fijada en `agent_context` o el proyecto del agente (`agents.project_id`). Una versión fijada que pertenece al proyecto de la tarea se respeta.

### `UserProfile` — con quién habla

```ts
interface UserProfile {
  id: string
  displayName: string
  preferences?: Record<string, unknown>
  facts?: string[]                         // "trabaja en Argentina", "es CTO de X"
  doNotDo?: string[]                       // anti-preferencias explícitas
}
```

Cambia raro, cachea bárbaro. Inspirado en `core_memory.human` de Letta.

### `TaskBriefing` — qué tiene que hacer

```ts
interface TaskBriefing {
  taskId?: string                    // FK a tasks si aplica
  title: string
  description: string
  expectedOutput?: string            // qué pinta tiene "done"
  priority: TaskPriority
  status: TaskStatus
  dependencies?: TaskId[]
  workingState?: string              // notas del agente entre corridas (agent_working_state)
  workspace?: TaskWorkspace          // worktree aislado de la tarea, si hay
  deadline?: string
}
```

Mapea 1:1 con la entity `Task` (`packages/types/src/domain.ts`), más `expectedOutput` (de CrewAI), `workingState` (las notas del agente en `agent_working_state`) y `workspace` (el worktree, tipado: el renderer le dice al agente dónde trabajar).

### `SessionMemory` — qué pasó antes

```ts
interface SessionMemory {
  recall:   RecallEntry[]            // historial conversacional reciente
  archival: ArchivalRef[]            // memoria semántica indexable
  working:  Record<string, unknown>  // KV mutable durante la sesión
}
```

Tres tiers tipo Letta. `recall` viene de `runtime_messages`. `archival` apunta a entries de `agent_memory` (la tabla que escribe el agente vía memory tool). `working` es del run actual y no se persiste entre runs.

La memoria semántica (búsqueda vectorial) está [diferida](/taia/arquitectura/adr/003-agent-context-bundle/#decisión-6--memoria-semántica-diferida). Hoy `archival` apunta a paths tipo filesystem en `agent_memory`.


## Modelo de datos

### Tablas del contexto del agente

| Tabla | Propósito | Quién escribe | Quién lee | Ciclo de vida |
|-------|-----------|---------------|-----------|---------------|
| **`agent_context`** | Fuente del bundle. Datos canónicos tipados (apunta a versiones de `agent_identity`, `project_context`, `user_profile`). | Humanos vía UI (`PATCH /api/agents/{id}/context`) + setup/enrichment. | Renderers de cada adapter, UI. | Larga duración, versionado. |
| **`agent_working_state`** | Notas del agente entre corridas (antes `WORKING.md`). | El agente y la UI (`/api/agents/{id}/working-state`). | `bundle.task.workingState`. | Una fila por agente. |
| **`agent_memory`** | Memoria mutable del agente, tipo filesystem (paths + content; `/memories/*.md`). | El agente vía memory tool (`memory_20250818`) o `/api/agents/{id}/memory`. | El agente; TAIA en UI. | Persistente entre runs. |
| **`agent_context_sync`** | Qué se empujó a un runtime que guarda el contexto como archivos (hashes, conflictos). | `context-sync.service`. | `context-sync.service`, `/context/sync`. | Una fila por agente y provider. |

`agent_files` está **retirada**: ningún código la lee ni la escribe, y ya no forma parte del esquema.

### Reglas duras

- **Single source of truth para identidad/proyecto/usuario**: `agent_context` y sus versiones.
- **Core no genera markdown**: cada adapter renderiza el bundle a su formato. Los archivos de OpenClaw se editan cambiando la identidad (`PATCH /context`), nunca a mano; `PUT /api/agents/{id}/files` sobre un archivo renderizado devuelve 409.
- **`agent_memory` es del agente**: TAIA puede leerla y editarla desde la UI, pero nunca la empuja a un runtime (`MEMORY.md` en OpenClaw lo escribe el agente).
- **Render es puro**: el mismo bundle produce siempre los mismos archivos (con su hash), lo que permite detectar si el agente editó uno.

### Mapeo bundle → tablas

| Capa | Origen |
|------|--------|
| `bundle.agent` | `agent_context.agent_identity_version_id` → `agent_identity_versions.content` |
| `bundle.project` | `projects` de la tarea en curso (`tasks.project_id`); si no tiene, la versión fijada o `agents.project_id` (versionado en `project_context_versions`) |
| `bundle.user` | La última versión de `user_profile_versions` del usuario `default` |
| `bundle.task` | `tasks` (FK por `assigned_to`) + `worktrees` + `agent_working_state` |
| `bundle.memory.archival` | Referencias a `agent_memory` (paths), no contenido inline |
| `bundle.memory.recall` | `runtime_messages` |
| `bundle.memory.working` | KV en memoria del run, no se persiste |

### Versionado

Tres tablas append-only, una por capa mutable:

```sql
CREATE TABLE agent_identity_versions (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  content       JSONB NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    TEXT,
  note          TEXT
);
-- mismo shape para project_context_versions, user_profile_versions
```

`agent_context` apunta a la última versión activa de cada capa. Cada save vía UI = fila nueva (no destructivo). Rollback = crear versión nueva con contenido viejo.

Con Claude por API, cada sesión guarda en `runtime_sessions.bundle_version_ids` las versiones que usó (`{ agent_identity, project_context, user_profile }`).

Cuando un agente empieza a comportarse raro, podés correlacionar `runtime_sessions.bundle_version_ids` con `agent_identity_versions.created_at` y ver qué cambió.

`task` y `memory` no se versionan: `task` se trackea por la entity `tasks` (existente), `memory` es del agente (live).


## Capabilities → tools

`AgentIdentity.capabilities` es un enum cerrado:

```ts
export type AgentCapability =
  | 'read_tasks'
  | 'write_tasks'
  | 'comment_tasks'
  | 'read_stats'
  | 'read_own_files'
  | 'memory'
```

Cada adapter declara su propio map `Record<AgentCapability, ToolName[]>`. Por ejemplo en `packages/runtime/src/adapters/anthropic/capabilities.ts`:

```ts
const CAPABILITY_TOOLS: Record<AgentCapability, string[]> = {
  read_tasks:     ['taia_tasks_list', 'taia_tasks_get'],
  write_tasks:    ['taia_tasks_create', 'taia_tasks_update'],
  comment_tasks: ['taia_tasks_comment'],
  read_stats:     ['taia_stats_get'],
  read_own_files: ['taia_agent_context_read'],  // identidad, instrucciones, notas
  memory:         ['memory'],   // memory_20250818
}

// resolveCapabilityTools(capabilities) devuelve el conjunto de tools sin repetidos
```

### Reglas

- Capability nuevas = una línea al enum + entradas en cada adapter map. TypeScript valida.
- Si una capability declarada no está mapeada en el adapter activo, el spawn falla con un error claro: *"AnthropicAdapter does not support capability 'X'. Supported: …"*.
- La misma capability puede mapear a tools distintas según el runtime: `read_tasks` en Anthropic son dos tools nativas; en OpenClaw lo resuelve el runtime.

### Cómo agregar una capability nueva

1. Sumar el string al type union en `packages/types/src/context.ts`.
2. Sumar entrada en `CAPABILITY_TOOLS` de cada adapter que vaya a soportarla.
3. Si requiere una tool nueva en el adapter, definirla y registrarla en `tools.ts` del adapter.
4. Si no aplica a un adapter, dejar la capability sin entrada — fallará loud al primer agente que la declare con ese adapter.


## Cómo cada adapter renderea

Cada adapter implementa la interfaz de `packages/runtime/src/context-renderer.ts`:

```ts
interface AgentContextRenderer<TRendered = unknown> {
  render(bundle: AgentContextBundle, options?: RenderOptions): TRendered
}
```

`RenderOptions.trigger` (`heartbeat`, `task` o `prompt`) le dice al renderer por qué arranca la corrida, así arma el primer mensaje. Los bloques de markdown compartidos (identidad, proyecto, usuario, tarea, API de TAIA) viven en `packages/runtime/src/context-markdown.ts`.

### `OpenClawContextRenderer`

Proyecta el bundle a los archivos de bootstrap del workspace: `SOUL.md` (persona y restricciones), `IDENTITY.md` (nombre y rol), `AGENTS.md` (instrucciones, uso de la API de TAIA y rutina de heartbeat) y `USER.md`. Cada archivo lleva su sha256 y el conjunto un fingerprint. Con `context_sync = push` el adapter los escribe con `agents.files.set` condicionado al hash; con `pull` el agente los baja de `GET /api/agents/{id}/files`, que los renderiza al vuelo.

### `AnthropicContextRenderer`

Arma el request a `POST /v1/messages` aprovechando prompt caching:

```ts
{
  system: [
    { type: 'text', text: renderAgentIdentity(bundle.agent),
      cache_control: { type: 'ephemeral' } },
    { type: 'text', text: renderProjectContext(bundle.project),
      cache_control: { type: 'ephemeral' } },
    { type: 'text', text: renderUserProfile(bundle.user),
      cache_control: { type: 'ephemeral' } },
  ],
  messages: [
    ...bundle.memory.recall.map(toAnthropicMessage),
    { role: 'user', content: renderTaskBriefing(bundle.task) }
  ],
  tools: resolveCapabilityTools(bundle.agent.capabilities)
    .map(name => ANTHROPIC_TOOLS[name]),
}
```

Las tres primeras capas son estables turn-a-turn → cache hit alto. Solo `task` y `memory.recall` son dinámicos. Lo arma `buildCachedSystem()` en `packages/runtime/src/adapters/anthropic/client.ts`.

### CLI (Claude Code, Aider, Cursor)

No tienen un canal de system prompt: `adapters/cli/context-prompt.ts` arma un único prompt con la identidad, el proyecto, el usuario, cómo llegar a TAIA (URL de la API) y la tarea.


## Cómo crear un `AgentContextRenderer` para un adapter nuevo

1. Crear `packages/runtime/src/adapters/<your-runtime>/context-renderer.ts`.
2. Implementar la interfaz `AgentContextRenderer` con el `RenderedContext` que tu runtime entiende (system prompt, messages, tools, threads, files, lo que sea).
3. Crear `packages/runtime/src/adapters/<your-runtime>/capabilities.ts` con el map `CAPABILITY_TOOLS`.
4. En `spawnSession()` del adapter:
   - Tomar `options.context` (el `AgentContextBundle`) y `options.trigger`.
   - Llamar al renderer.
   - Pasar el `RenderedContext` al cliente del runtime.
5. Sumar test de equivalencia: dado un bundle conocido, verificar que el renderer produce el output esperado vía snapshot.

Ver [Escribir un adapter](/taia/runtimes/escribir-un-adapter/) para el resto del contrato.


## Flujo end-to-end de un heartbeat

Así corre un heartbeat de un agente:

1. **Trigger**: `triggerAgentHeartbeat(agentId)` en `packages/core/src/services/trigger.service.ts`.
2. **Carga del bundle**: el servicio hace `loadAgentContextBundle(agentId)` que junta:
   - `agents` + `agent_identity_versions` (la versión activa) → `bundle.agent`
   - `projects` via `agents.project_id` → `bundle.project`
   - la última versión de `user_profile_versions` → `bundle.user`
   - `tasks WHERE assigned_to=agentId AND status IN (...)` + `worktrees` + `agent_working_state` → `bundle.task`
   - `runtime_messages` recientes + `agent_memory` refs → `bundle.memory`
3. **Sync**: si el runtime guarda el contexto como archivos (`ContextSync`), `ensureAgentContextSynced` lo empuja antes de arrancar.
4. **Spawn**: `adapter.spawnSession(fallback, { agentId, context: bundle, trigger: { kind: 'heartbeat' } })`; el adapter arma el mensaje inicial con su renderer. Los runtimes sin settings por agente reciben además el modelo elegido en TAIA.
5. **Audit trail**: con Claude por API, la sesión guarda en `runtime_sessions.bundle_version_ids` las versiones que usó.
6. **Run**: el adapter ejecuta su loop nativo (HTTP a Anthropic, WS a OpenClaw, etc.).
7. **Memory writes**: si el agente escribe en `agent_memory` durante el run, queda persistente para el próximo run.


## Glosario

Los términos de esta página (bundle, capa, renderer, proyección, versión, capability) están en el [glosario](/taia/conceptos/glosario/).
