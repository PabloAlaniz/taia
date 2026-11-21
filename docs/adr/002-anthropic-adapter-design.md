# ADR-002: AnthropicAdapter — decisiones de diseño

**Estado**: Aceptado
**Fecha**: 2026-05-05

> **Estado actual:** varias de las decisiones de abajo eran "diferir para después". Hoy el adapter ya hace streaming (`LiveEvents`), prompt caching con precios diferenciados y aprobaciones opcionales (`Approvals`). El resto del ADR queda como registro de por qué se eligió cada camino.

## Contexto

Después de cerrar la abstracción `AgentRuntimeAdapter`, el siguiente paso natural es validar el diseño contra un segundo runtime. Anthropic es el caso obvio: cualquier usuario con `ANTHROPIC_API_KEY` debería poder operar TAIA standalone, sin levantar OpenClaw.

Antes de escribir código se evaluaron varias bifurcaciones de diseño. Este ADR documenta lo que **se descartó** y por qué — para que un revisor de PR o un contributor futuro entienda el contexto sin tener que reconstruirlo.

---

## Decisión 1 — Surface: Messages API directo (no Managed Agents)

### Opciones evaluadas

| Opción | Descripción |
|---|---|
| **A. Messages API directo** ✅ | `client.messages.create()` stateless. TAIA mantiene la conversación en su DB, ejecuta el tool loop client-side. |
| B. Managed Agents | `client.beta.agents.create()` + `sessions.create()`. Anthropic corre el loop server-side, container Linux por sesión, file mounts. |
| C. Ambos como providers separados | `anthropic` (Messages) + `anthropic-managed` (Managed Agents) como dos adapters. |

### Decisión

**Messages API directo.** Capabilities: `Sessions`, `Transcripts`, `LiveEvents`, `Health`.

### Por qué no Managed Agents

1. **Rompe la abstracción `AgentRuntimeAdapter`.** El adapter está diseñado para que TAIA controle el loop (`spawn → tool_use → call → tool_result → next turn`). Managed Agents corre eso server-side, así que el adapter pasaría a ser un envoltorio fino sobre SSE — y las TAIA-native tools tendrían que viajar como `custom tools` con callbacks vía stream, agregando latencia y complejidad.
2. **Costos extra de container.** Después del free tier (1550 hrs/mes), cada sesión paga compute además de tokens. Messages API solo paga tokens.
3. **El modelo de container hosted no encaja con TAIA.** TAIA ya tiene `runtime_sessions` en su DB (agregada junto con este adapter), worktrees propios, y un modelo de attachments en roadmap. Duplicar eso con file mounts hosted en Anthropic es contradictorio.
4. **Managed Agents tiene su propio versionado de agents.** TAIA ya versiona agents en su tabla `agents`. Mantener ambos sistemas alineados (cuándo crear nueva versión, cómo pinear sessions a versión, cuándo archive) es complejidad sin payoff inmediato.

### Por qué no ambos

Crear `anthropic-managed` como segundo provider es trabajo neto sin demanda probada. Si más adelante un usuario pide "quiero el container Linux dedicado por sesión", se agrega como adapter aparte. La abstracción está hecha exactamente para eso. Mientras tanto, evitar superficie no usada.

### Consecuencia

El AnthropicAdapter es **stateless del lado de Anthropic**: cada `messages.create` es una llamada nueva con el historial reconstituido desde TAIA DB. Esto implica que TAIA paga el costo full de input tokens en cada turno (sin prefijo cachado server-side). Mitigación posterior con `cache_control` (prompt caching cliente-side, donde la cache vive en Anthropic pero TAIA dispara los breakpoints).

---

## Decisión 2 — Tools: nativas en el adapter (no MCP)

### Opciones evaluadas

| Opción | Descripción |
|---|---|
| **A. Tools nativas en el adapter** ✅ | `tools.ts` define `taia_tasks_list`, `taia_tasks_create`, `taia_stats_get`, etc. como `Anthropic.Tool[]`. Tool execution loop hace HTTP fetch interno a la API de TAIA. |
| B. Reusar el MCP server existente (`apps/mcp/`) | El agent corre con el MCP server de TAIA conectado. El adapter no expone tools propias; las tools vienen del MCP. |
| C. Ambos: nativas + MCP opcional | Tools nativas siempre disponibles. MCP queda para casos donde el agent corre fuera del adapter (Claude Code, Cursor). |

### Decisión

**Tools nativas en el adapter.**

### Por qué no MCP-only

1. **Anthropic Messages API no es MCP-aware.** El SDK no tiene "registrar un MCP server"; espera `tools: Anthropic.Tool[]` en la request. Para usar MCP habría que correr un proceso intermediario MCP→Tool, lo cual es más complejidad.
2. **Latencia extra.** Tools nativas hacen HTTP a `localhost:13333/api/tasks`. MCP agrega un hop más (proceso MCP server → HTTP).
3. **El MCP server existente sigue siendo útil para clients externos** (Claude Code, Cursor, agentes que viven fuera de TAIA). No se descarta — sigue corriendo. El adapter simplemente no lo usa para sus propios tool calls.

### Por qué no ambos

Mismo argumento que Decisión 1: superficie no demandada. Si un usuario quiere conectar el adapter al MCP server por algún motivo, se puede sumar después como capability opcional. Hoy no hay caso de uso.

### Consecuencia

El adapter expone una **lista fija de tools** (~6 al inicio). La lista es la **misma** que ya expone el MCP server, solo expresada en formato `Anthropic.Tool` vs MCP. Si en el futuro las tools cambian (nueva tool, schema actualizado), hay dos lugares para mantener: el MCP server y el archivo `tools.ts` del adapter. Mitigación: posible refactor más adelante para generar ambos desde una fuente única (deferido — premature abstraction hasta que cambien).

---

## Decisión 3 — Capabilities omitidas

### Decisión

`AnthropicAdapter.capabilities = [Sessions, Transcripts, LiveEvents, Health]`. **Sin** `Cron`, `ConfigRead`, `ConfigWrite`, `Approvals`.

### Por qué cada omisión

| Capability omitida | Razón |
|---|---|
| `Cron` | Anthropic no tiene cron server-side. Hay dos caminos posibles: (a) declarar `Cron` y implementar un scheduler TAIA-side que dispare heartbeats, (b) no declararla y dejar que `cron.service` tire `RuntimeCapabilityError`. **Elegimos (b)**. Implementar cron TAIA-side queda para más adelante (junto con Batch API, que reduce 50% el costo de heartbeats periódicos). Hoy: solo trigger manual desde la UI. |
| `ConfigRead` / `ConfigWrite` | Anthropic no tiene "config remota del runtime" — la config es la API key + modelo, ambos son TAIA-side. No hay nada que leer ni patchear. |
| `Approvals` | OpenClaw emite `exec.approval.requested` para tools sensibles. Anthropic no tiene esto nativo. Se puede simular con un gate en el executor + UI de approval, pero no en la primera versión. |

### Consecuencia

Servicios que requieren `Cron` (`cron.service.listCrons`, `cron.service.createCron`, etc.) tiran `RuntimeCapabilityError` claro cuando el adapter activo es Anthropic. La UI de cron management debería ocultar esos controles cuando el provider activo no soporta `Cron` (mejora UI deferida — por ahora la API rechaza con mensaje claro).

---

## Decisión 4 — Streaming: diferido a una segunda iteración

### Opciones evaluadas

| Opción | Descripción |
|---|---|
| **A. Streaming después** ✅ | La primera versión usa `messages.create()` (no `.stream()`). `LiveEvents` capability declarada pero `on()` es no-op. El streaming completo llega en una segunda iteración. |
| B. Streaming desde el inicio | Implementar `messages.stream()` desde el día 1, mapear deltas a eventos `chat`/`agent` compatibles con SSE existente. |

### Decisión

**El streaming va en una segunda iteración.**

### Por qué deferir

1. **Reduce el alcance de la primera versión a algo verificable rápido.** Con streaming, el adapter tiene que coordinar con el broadcast layer interno de TAIA (`apps/web/app/api/agents/[agentId]/stream/route.ts`) — eso es trabajo de mapeo no trivial.
2. **Permite validar la abstracción primero.** Si el contrato `AgentRuntimeAdapter` no aguanta Anthropic en su forma más simple (request-response), no aguanta streaming tampoco. Mejor descubrir el problema temprano.
3. **El polling es un fallback aceptable.** `awaitSessionComplete` ya está pensado para soportar polling (`fallbackPollIntervalMs`). El adapter usa polling sobre `runtime_sessions.status` hasta que llegue el streaming.

### Consecuencia

En la primera versión, los transcripts en la UI **no se actualizan en tiempo real** para agents Anthropic — el usuario tiene que refrescar. Con el streaming eso desaparece.

---

## Decisión 5 — Cache pricing: diferido

### Decisión

El pricing de la primera versión es **flat** — `total_tokens × pricing_table[model]`. Las columnas `cache_creation_input_tokens` y `cache_read_input_tokens` existen en el schema (`runtime_sessions`) pero el cost calculator las ignora.

### Por qué deferir

Prompt caching va aparte porque requiere:
1. Decidir dónde poner los `cache_control` breakpoints (system prompt, tools, last user message).
2. Auditar que no haya silent invalidators (timestamps en system prompt, etc.).
3. Extender la `PRICING_TABLE` con tarifas diferenciadas (cached input ~0.1×, cache write ~1.25×).
4. Sumar dashboard metrics (cache hit rate por agent/modelo).

Implementarlo prematuramente lleva a hacer placement subóptimo y tener que rehacer. Mejor: primero costos flat (sobrestimados, lo cual es seguro), después caching real.

### Consecuencia

En la primera versión, los costos reportados por TAIA pueden estar **sobrestimados** — el usuario ve $X cuando Anthropic le cobró $X×0.6 (porque parte del input fue auto-cacheado por Anthropic en sus internals). Esto es conservador: nunca sub-reporta. El caching real lo ajusta.

---

## Decisión 6 — Persistencia de sesiones: tabla genérica `runtime_sessions`

### Opciones evaluadas

| Opción | Descripción |
|---|---|
| **A. Tabla genérica `runtime_sessions`** ✅ | Schema agnóstico de provider. Cualquier adapter futuro (Cursor, Aider) que necesite session storage la usa. |
| B. Tabla específica `anthropic_sessions` | Dedicada al AnthropicAdapter. Schema afinado para necesidades específicas. |
| C. Reusar `session_costs` con metadata JSONB | No agregar tabla; meter messages en una columna JSONB de `session_costs`. |

### Decisión

**Tabla genérica `runtime_sessions` + `runtime_messages`.**

### Por qué no específica

Premature specialization. El schema que necesita Anthropic (`session_key`, `agent_id`, `provider`, `model`, `status`, token columns, messages) es básicamente el mismo que necesita cualquier adapter stateless. Hacer una tabla `anthropic_sessions` y después una `cursor_sessions` y otra `aider_sessions` es duplicación.

### Por qué no reusar `session_costs` con JSONB

`session_costs` está diseñada para **tracking de costos**, no para **storage de transcripts**. Meter messages array en JSONB:
1. Hace queries para listar sessions más caras (la JSONB rota cada turno).
2. Pierde la posibilidad de indexar por `position` para paginar mensajes.
3. Convierte una tabla focused en cost en algo "todopoderoso" — antipattern.

### Consecuencia

Schema agnóstico desde el día 1. Cuando se sume Cursor/Aider/etc., esos adapters reusan `runtime_sessions` directamente. La columna `provider` (`'anthropic'`, `'cursor'`, etc.) discrimina. Nada que migrar.

---

## Resumen de decisiones

| # | Decisión | Alternativas descartadas |
|---|---|---|
| 1 | Messages API directo | Managed Agents; ambos como providers |
| 2 | Tools nativas en el adapter | MCP-only; ambos |
| 3 | Capabilities `[Sessions, Transcripts, LiveEvents, Health]` | Cron, ConfigRead/Write, Approvals (deferidos) |
| 4 | Streaming en una segunda iteración | Streaming desde el inicio |
| 5 | Cache pricing diferido | Cache pricing desde el inicio |
| 6 | Tabla genérica `runtime_sessions` | Tabla `anthropic_sessions`; JSONB en `session_costs` |

---

## Cuándo revisar este ADR

Revisar (y posiblemente reemplazar con un ADR-XXX nuevo) si:

- Se decide implementar un adapter para Managed Agents y queremos rejustificar la coexistencia.
- Anthropic agrega cron / config endpoints server-side y conviene declarar esas capabilities.
- El tool loop client-side resulta demasiado lento o caro y conviene migrar a PTC (Programmatic Tool Calling).
- Aparece un segundo adapter stateless (Cursor, Aider) y descubrimos que `runtime_sessions` necesita extensiones que las hacen específicas.
