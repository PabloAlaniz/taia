# ADR-003: Agent Context Bundle — modelo de contexto agnóstico al runtime

**Estado**: Aceptado
**Fecha**: 2026-05-06

## Contexto

OpenClaw resuelve el contexto del agente porque puede leer archivos (`SOUL.md`, `HEARTBEAT.md`, `WORKING.md`, `memory/*.md`) vía Bash. Cuando el runtime es la API "pelada" de Anthropic Messages, OpenAI Chat Completions o un Anthropic Agent SDK, el agente no tiene Bash y el contexto hay que **inyectarlo** (push), no exponerlo (pull).

El estado del código al escribir este ADR, con la primera versión del AnthropicAdapter ya integrada, deja un end-to-end roto en Anthropic:

1. `AnthropicAdapter` recibe un único `systemPrompt` en construcción (`packages/runtime/src/adapters/anthropic/adapter.ts:46-52`). El wiring no le pasa ninguno (`packages/core/src/anthropic-wiring.ts:324-338`), así que sale `system: undefined` para todos los agentes.
2. `SpawnOptions` no tiene campo de contexto (`packages/runtime/src/types.ts`). Sólo viaja la string del task.
3. `getHeartbeatMessage()` arma strings con URLs (`packages/core/src/agents/metadata.ts:29-35`); el agente Anthropic no tiene tool para seguir esas URLs.
4. `agentId` viaja en `SpawnOptions` pero no se usa para resolver identidad.

→ El agente no sabe quién es ni qué tiene que hacer.

Antes de escribir código se evaluaron varias bifurcaciones de diseño. Este ADR documenta lo que se decidió y por qué — para que un revisor de PR o un contributor futuro entienda el contexto sin reconstruirlo.

---

## Decisión 1 — 5 capas conceptuales con responsabilidades disjuntas

### Opciones evaluadas

| Opción | Descripción |
|---|---|
| **A. Bundle de 5 capas** ✅ | `{ agent, project, user, task, memory }`, cada una con responsabilidad disjunta. |
| B. System prompt monolítico | Un único string editable por agente. Lo más cercano al status quo de OpenClaw (SOUL.md). |
| C. Memoria jerárquica tipo Letta | `core_memory` (persona + human) + `archival_memory` (vector) + `recall_memory` (chronological). Sin separación explícita de project/task. |
| D. Estilo CrewAI | `Agent (role, goal, backstory) + Task (description, expected_output)`. Sin user profile ni project knowledge formal. |

### Decisión

```ts
interface AgentContextBundle {
  agent:   AgentIdentity      // QUIÉN es
  project: ProjectContext     // QUÉ sabe del dominio
  user:    UserProfile        // CON QUIÉN habla
  task:    TaskBriefing       // QUÉ tiene que hacer ahora
  memory:  SessionMemory      // QUÉ pasó antes (recall + archival + working)
}
```

### Por qué cinco capas

Letta, Mastra, OpenAI Agents y la doc oficial de Anthropic Skills convergen en estas separaciones (con nombres distintos). Cada capa tiene un ciclo de vida y un editor distinto:

- `agent` — humano vía UI, raramente cambia.
- `project` — humano vía UI, cambia cuando entran nuevos dominios.
- `user` — humano vía UI o sync de identidad, cambia raro.
- `task` — el orquestador de TAIA, cambia por run.
- `memory` — combinación: `recall` desde `runtime_messages`, `archival` escrito por el agente.

Esa separación habilita prompt caching nativo en Anthropic: las primeras tres son estables turn-a-turn → cache hit alto. Si fuera un único string monolítico, cualquier cambio de tarea invalida toda la caché.

### Por qué no monolítico (Opción B)

Funciona para OpenClaw porque OpenClaw no paga input tokens. Cualquier API "pelada" paga 100% de input cada turn → caching es la economía. Sin separación de capas, no hay caching útil.

### Por qué no Letta puro (Opción C)

`core_memory` colapsa agente y user. Lindo cuando hay un solo user, problemático con multi-tenant. El bundle separa.

### Por qué no CrewAI puro (Opción D)

CrewAI no tiene primitiva de "qué sabe el agente del proyecto" — todo va en `backstory`. Termina siendo un cajón de sastre que crece sin estructura.

### Consecuencia

5 capas tipadas (`packages/types/src/context.ts`, a crear). Cada adapter implementa un `AgentContextRenderer` que las traduce a su formato nativo. Más detalle en [Modelo de contexto](https://pabloalaniz.github.io/taia/arquitectura/modelo-de-contexto/).

---

## Decisión 2 — Tres tablas con propósitos disjuntos

> **Enmendada por [ADR-005](./005-runtime-owned-context-and-settings.md):** `agent_files` se retira; los archivos nativos (SOUL.md, AGENTS.md…) los renderiza y sincroniza el adapter a partir de `agent_context`.

### Opciones evaluadas

| Opción | Descripción |
|---|---|
| **A. Tres tablas separadas** ✅ | `agent_context` (fuente bundle) + `agent_files` (proyección OpenClaw) + `agent_memory` (mutable por el agente). |
| B. Una sola tabla unificada | Todo en `agent_files` con un campo `kind` (`'soul'`, `'heartbeat'`, `'memory'`, `'context_json'`). |
| C. JSONB monolítico | Un único `agent_context` con JSONB que mezcla todo. |

### Decisión

| Tabla | Propósito | Quién escribe | Quién lee | Ciclo de vida |
|-------|-----------|---------------|-----------|---------------|
| `agent_context` | Fuente del bundle. Datos canónicos tipados. | Humanos via UI + servicios de setup/enrichment. | `AgentContextRenderer`, UI. | Larga duración. Cambia al rotar persona/instrucciones. |
| `agent_files` | **Proyección OpenClaw del bundle.** SOUL.md / HEARTBEAT.md / WORKING.md. | `OpenClawContextRenderer` (auto-regenera). Nunca un humano. | OpenClaw vía Bash/HTTP. | Regenerable: si se borra, se reconstruye desde `agent_context`. |
| `agent_memory` | Memoria mutable del agente, escrita por él mismo. Estructura tipo filesystem. | El agente vía memory tool (`memory_20250818`). | El agente; TAIA en UI de auditoría. | Persistente entre runs. |

### Reglas duras

- **`agent_context` es la única fuente de verdad** para identidad/proyecto/usuario.
- **`agent_files` no se edita a mano**: cualquier cambio se pierde en el próximo render. La UI de "editar SOUL.md" edita `agent_context.agent_identity`, no el .md.
- **`agent_memory` es del agente**: TAIA puede leerla (auditoría) pero no escribirla.
- **Render es idempotente**: `OpenClawContextRenderer.render(bundle)` produce siempre el mismo .md para el mismo bundle.

### Por qué no una sola tabla

`agent_files` ya existe y tiene semántica "archivos para que OpenClaw los baje vía HTTP". Mezclar ahí el bundle estructurado obliga a cargar siempre el JSON aunque solo querás SOUL.md. La separación es físicamente más eficiente y conceptualmente más clara.

### Por qué no JSONB monolítico

Pierde la posibilidad de versionar capas independientemente (Decisión 4). Mezcla "lo que escribe el humano" con "lo que escribe el agente" en la misma fila → races, audit trail confuso.

### Consecuencia

Tres tablas, tres responsabilidades. La tabla `agent_memory` ya existe y cubre la capa `SessionMemory.archival` del bundle — bundle apunta, no duplica.

---

## Decisión 3 — `Project` como entidad de DB

### Decisión

Tabla nueva `projects`:

```sql
CREATE TABLE projects (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  glossary     JSONB,            -- Record<string, string>
  knowledge_refs JSONB,          -- KnowledgeRef[]
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
```

Más:

- `agents.project_id TEXT REFERENCES projects(id)` (nuevo, nullable durante migración).
- `tasks.project_id` ya existe en `packages/types/src/domain.ts` como `string?` libre — formalizar como FK a `projects(id)`.
- Setup inicial crea un proyecto "default" (id derivado del workspace name); todos los agentes nuevos lo heredan si no se especifica otro.

### Por qué entidad y no config singleton

El bundle necesita una capa `project` con datos estructurados (glossary, knowledge refs) que pueden variar por agente. Si fuera un singleton, todo agente tendría el mismo proyecto — multi-proyecto requeriría refactor más adelante. Hacer la tabla ahora es un `CREATE TABLE` más una FK; convertir un singleton a tabla después es trabajo neto.

### Consecuencia

Multi-proyecto soportado de fábrica. `ProjectContext` del bundle se llena con `SELECT FROM projects WHERE id = agent.project_id`.

---

## Decisión 4 — Versionado append-only por capa mutable

### Opciones evaluadas

| Opción | Descripción |
|---|---|
| **A. Append-only por capa mutable** ✅ | `agent_identity_versions` + `project_context_versions` + `user_profile_versions`. `agent_context` apunta a la última. Cada save = fila nueva. |
| B. Bundle entero versionado | `agent_context_versions` con todo el JSON congelado por versión. |
| C. Última versión + log de diffs | Tabla principal con valor actual + tabla `*_changelog` con diffs. |
| D. Sin versionado | Pisar y olvidar. |

### Decisión

**Opción A.** Tres tablas nuevas, una por capa mutable:

```sql
CREATE TABLE agent_identity_versions (
  version_id    TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  content       JSONB NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    TEXT,
  note          TEXT
);
-- mismo shape para project_context_versions y user_profile_versions
```

`agent_context` referencia las últimas activas:

```sql
agent_context.agent_identity_version_id   → última activa
agent_context.project_context_version_id  → última activa
agent_context.user_profile_version_id     → última activa
```

Audit trail por run en `runtime_sessions`:

```sql
ALTER TABLE runtime_sessions ADD COLUMN bundle_version_ids JSONB;
-- shape: { agent_identity: 'v_xxx', project_context: 'v_yyy', user_profile: 'v_zzz' }
```

### Reglas

- Cada save vía UI = versión nueva. No hay edición destructiva.
- Rollback = crear versión nueva con contenido viejo. Nunca se borra del historial.
- `task` y `memory` no se versionan: `task` se trackea por la entity `tasks`, `memory` es del agente (live).

### Por qué no bundle entero (Opción B)

Cada cambio de project (compartido entre N agentes) generaría una versión nueva del bundle de cada agente que lo usa. Explosión combinatoria. Versionar por capa permite que un cambio de project sea una fila en `project_context_versions`, y los `runtime_sessions` posteriores apuntan a la nueva versión del project, manteniendo `agent_identity` igual.

### Por qué no diff-based (Opción C)

Rollback requiere reconstruir desde diffs, complejidad innecesaria. Append-only completo es simple, y JSONB con texto repetido comprime bien.

### Por qué no skipear versionado

Cuando un agente empieza a comportarse raro, queremos saber qué versión usó cada run y poder hacer rollback. Sin esto, debugging de regresiones de comportamiento es ciego. El costo (3 tablas extra, JSONB) es bajo comparado al valor en diagnosis.

### Consecuencia

Trazabilidad completa: cada run linkea a las tres versiones que usó. UI mínima v1: lista de versiones con timestamp + autor + note + diff plain text bajo demanda. Botón "restaurar a versión X" que crea una versión nueva.

---

## Decisión 5 — Capabilities como enum cerrado + map por adapter

### Opciones evaluadas

| Opción | Descripción |
|---|---|
| A. String libre (status quo) | `capabilities: string[]`. Cero validación. |
| **B. Enum cerrado + map por adapter** ✅ | Type union de TS + cada adapter declara su `Record<Capability, ToolName[]>`. |
| C. Registry runtime-pluggable | Adapters registran capabilities dinámicamente al cargar. Validación dinámica. |

### Decisión

```ts
// packages/types/src/context.ts
export type AgentCapability =
  | 'read_tasks'
  | 'write_tasks'
  | 'comment_tasks'
  | 'read_stats'
  | 'read_own_files'
  | 'memory'

interface AgentIdentity {
  // ...
  capabilities: AgentCapability[]
}
```

```ts
// packages/runtime/src/adapters/anthropic/capabilities.ts
const CAPABILITY_TOOLS: Record<AgentCapability, string[]> = {
  read_tasks:     ['taia_tasks_list', 'taia_tasks_get'],
  write_tasks:    ['taia_tasks_create', 'taia_tasks_update'],
  comment_tasks: ['taia_tasks_comment'],
  read_stats:     ['taia_stats_get'],
  read_own_files: ['taia_agent_files_read'],
  memory:         ['memory'],   // memory_20250818
}
```

Flujo en el adapter al spawn: lee `bundle.agent.capabilities`, resuelve tools via `CAPABILITY_TOOLS`, filtra `TAIA_TOOLS` con `filterTools()` ya existente. Si una capability declarada no está mapeada en el adapter, falla loud con error claro.

### Por qué no string libre

Typos invisibles. `"writes_tasks"` o `"create_task"` son indistinguibles de capabilities reales. Sin TypeScript validation, los errores aparecen como "el agente no recibe la tool" tres días después.

### Por qué no registry pluggable

Sobreingeniería. Agregar pluggability cuando aparezca un adapter externo real (third-party plugin), no antes.

### Por qué falla loud y no silencioso

Declarás `'memory'` y el adapter no lo soporta → mejor enterarte al primer spawn que después de 3 días de "el agente no recuerda nada".

### Consecuencia

Multi-runtime real: el mismo bundle (`capabilities: ['read_tasks']`) renderea distinto en cada adapter. OpenAIAssistantsAdapter mapeará `read_tasks` a un function call distinto. OpenClaw lo ignora porque las tools de OpenClaw las maneja el runtime, no el adapter.

---

## Decisión 6 — Memoria semántica diferida

### Decisión

La capa `SessionMemory.archival` del bundle queda definida en el tipo, pero **sin infra atrás** en la primera implementación. La tabla `agent_memory` cubre el caso filesystem-like vía memory tool de Anthropic.

### Por qué diferir

Memoria semántica real (vector search por significado) requiere decidir:

- Backend (pgvector vs OpenAI vector store vs Pinecone/Qdrant).
- Qué se vectoriza (archivos de memory, runtime_messages, tasks).
- Cuándo se hace embedding (write-time sync vs background worker).
- Cómo se inyecta (tool `taia_memory_search` vs auto-inject en system prompt).

La tabla `agent_memory` filesystem-like cubre el 80% de casos por ahora. Cuando un agente concreto empiece a "no encontrar info que sabe que tiene", se evalúa pgvector + tool `taia_memory_search` write-time. Sin worker async hasta que la latencia duela.

### Consecuencia

`SessionMemory.archival: ArchivalRef[]` queda como tipo definido. Los renderers actuales lo ignoran. Cuando se implemente, los `ArchivalRef` apuntan a entries de `agent_memory` (paths, no contenido inline) y el renderer decide si los inyecta full-text o vía tool de búsqueda.

---

## Resumen de decisiones

| # | Decisión | Alternativas descartadas |
|---|---|---|
| 1 | Bundle de 5 capas (`agent`, `project`, `user`, `task`, `memory`) | Monolítico; Letta puro; CrewAI puro |
| 2 | Tres tablas (`agent_context`, `agent_files`, `agent_memory`) | Tabla única; JSONB monolítico |
| 3 | `projects` como entidad de DB | Singleton de config |
| 4 | Versionado append-only por capa mutable | Bundle entero; diff-based; sin versionar |
| 5 | Capabilities enum cerrado + map por adapter | String libre; registry pluggable |
| 6 | Memoria semántica diferida | Implementar ahora con pgvector |

---

## Cuándo revisar este ADR

Revisar (y posiblemente reemplazar con un ADR-XXX nuevo) si:

- Un adapter nuevo requiere una capa del bundle que no existe (ej: tool registry compartido entre agentes, knowledge graph cross-project).
- La granularidad por-capa del versionado resulta insuficiente (ej: queremos versionar tools individuales o constraints).
- Aparece un caso de uso donde la separación `agent_context` / `agent_files` / `agent_memory` deja de tener sentido.
- Memoria semántica real entra en scope y conviene revisar el contrato de `SessionMemory.archival`.
