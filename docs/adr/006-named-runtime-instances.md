# ADR-006: Instancias de runtime con nombre

**Estado**: Aceptado
**Fecha**: 2026-10-28

## Contexto

Antes de este cambio, TAIA tenía **un solo runtime global**:

- `runtime.default_provider` elegía el provider;
- `runtime.providers.<provider>.*` guardaba su config;
- `registry.ts` mantenía un `activeAdapter` singleton.

`getRuntimeAdapterForAgent(agentId)` existía, pero ignoraba al agente. Por eso un agente no podía correr en otro runtime que el resto. Tampoco podían convivir dos runtimes del mismo provider, como dos gateways de OpenClaw o dos API keys de Anthropic.

## Decisión

### 1. El agente corre en una instancia, no en un provider

Una **instancia** es un provider más su configuración, con un id slug:

- **Config no secreta** (`url`, `model`, `command`, `cwd`, `promptMode`, `context_sync`, `enabled`, `taia_base_url`): va en la tabla `runtime_instances (id, provider, label, config JSONB)`.
- **Secretos y estado emitido por el runtime** (token o API key, identidad de dispositivo y device tokens de OpenClaw, estado de conexión): van en `settings`, bajo `runtime.instances.<id>.*`. Ahí la API de settings los enmascara.
- **Instancia default:** `runtime.default_instance`. Si no hay default, TAIA corre en modo standalone.
- **Instancia de cada agente:** `agent_runtime_settings.runtime_instance_id`. `NULL` significa la instancia default, y una instancia con agentes asignados no se puede borrar (FK).
- **Sesiones:** `runtime_sessions.instance_id` registra qué instancia es dueña de cada sesión.

### 2. Pool de adapters en core

`packages/core/src/runtime.ts` mantiene un adapter por instancia: `Map<instanceId, {adapter, configKey}>`. El adapter se reconstruye cuando cambia la config de esa instancia.

| Función | Uso |
|---|---|
| `getRuntimeAdapterForAgent(agentId)` | Todo lo que actúa sobre un agente: spawn, transcript, cron, costos, stream, contexto, settings |
| `getDefaultRuntimeAdapter()` | Sesiones utilitarias (planning, setup, enrichment) y alertas |
| `forEachRuntime(fn)` | Listados globales: sesiones, squad, costos, modelos, settings, health |
| `getRuntimeAdapter(id)`, `peekRuntimeAdapter(id)`, `disposeRuntimeAdapter(id?)` | Acceso por instancia |

El registry de `@taia/runtime` queda solo como registro de factories. `RuntimeProviderConfig.instanceId` le dice a cada factory de qué instancia es el adapter. Los adapters que guardan estado en el host lo separan por instancia:

- **OpenClaw:** un credential store por instancia, porque cada gateway parea su propio dispositivo.
- **Anthropic:** un session store filtrado por `instance_id`, y las tools de TAIA llaman a la `taia_base_url` de la instancia.

### 3. Fan-out de los listados globales

`forEachRuntime(fn)` corre `fn` en paralelo sobre cada instancia configurada (la default primero). Cada instancia tiene un timeout propio (`FAN_OUT_TIMEOUT_MS`, 10 s): la que falla o no contesta queda en `failures` y el resto sigue. Un gateway caído nunca deja el tablero vacío.

- **Sesiones:** se unen y se ordenan por actividad; cada una lleva su `instanceId`. El detalle de una sesión va a la instancia que la tiene: la que indica el cliente (`?instance=`), la registrada en `runtime_sessions.instance_id`, o la primera que la lista.
- **Agentes:** `mergeAgentListings` deja una entrada por agente, tomada de la instancia en la que corre. Un agente que aparece primero en una instancia que no es la default queda asignado a esa instancia al sincronizarse. Los agentes de una instancia que no contesta siguen en el squad, con los datos de TAIA.
- **Provisioning:** `provisionAgentsInRuntime` agrupa los agentes por instancia. El reporte pasa a ser `{ ok, instances: { <id>: InstanceProvisioningReport } }`.
- **Health:** `/api/runtime/health` devuelve el estado de cada instancia y un agregado (`connected`, `degraded`, `connecting` o `disconnected`).
- **Config nativa:** `/api/gateway/config?instance=<id>` lee o parchea la de una instancia; sin el parámetro, la de la default.

### 4. Esquema

- **`runtime_instances`** guarda la config no secreta de cada instancia; los secretos y el estado que emite el runtime van a `runtime.instances.<id>.*` en `settings`.
- **`agent_runtime_settings.runtime_instance_id`** (FK, `NULL` = default) asigna cada agente, y **`runtime_sessions.instance_id`** registra en qué instancia corrió cada sesión.
- **Default:** `runtime.default_instance`. Sin default, TAIA corre en modo standalone.

(En el desarrollo previo a la primera versión pública, una migración armó las instancias a partir de las claves `runtime.providers.*`. El esquema base público ya nace con este modelo.)

### 5. Transición

Mientras no exista la gestión de instancias en la UI, la UI de settings sigue editando un runtime por provider. Cada escritura de `runtime.providers.<p>.*` o `runtime.default_provider` se aplica a la instancia `<p>` (`applyProviderSetting`), así que el runtime lee solo instancias.

Cuando llegue esa gestión, la UI pasa a ser una lista de instancias y se borran ese puente y las claves `runtime.providers.*`, con una migración nueva si hiciera falta.

## Consecuencias

- **Mismo comportamiento con una sola instancia.** Instalar o actualizar no cambia lo que se ve.
- **Los listados globales cuestan una llamada por instancia.** Con muchas instancias, el timeout por instancia acota la latencia, no el volumen.
- **El estado de sync de contexto** (`agent_context_sync`) sigue indexado por `(agent_id, provider)`. Reasignar un agente entre dos instancias del mismo provider lo marca stale, hasta que llegue la gestión de instancias.
