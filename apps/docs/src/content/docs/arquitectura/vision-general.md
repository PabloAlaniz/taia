---
title: Visión general y límites
description: Cómo se reparten las responsabilidades entre core, runtime y adapters.
---

TAIA es el producto, y cada runtime es un adapter más: ninguno es el centro. El core no asume ningún runtime concreto. Le pregunta a cada adapter qué sabe hacer y usa solo eso.

## Capas

```
┌─────────────────────────────────────────────────────────────┐
│ apps/web (Next.js) · apps/mcp · tools/cli                    │
│ UI, API REST, servidor MCP, CLI                              │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ @taia/core                                                   │
│ Reglas de negocio, base de datos, eventos, validación,       │
│ instancias de runtime y pool de adapters                     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼  tipos canónicos
┌─────────────────────────────────────────────────────────────┐
│ @taia/runtime                                                │
│ Interfaz AgentRuntimeAdapter, CapabilitySet, tipos           │
│ canónicos y registry. Sin transporte ni base de datos        │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Adapters: openclaw · anthropic · claude-code · aider ·        │
│ cursor · none                                                │
│ Transporte, tipos nativos y mappers. Sin lógica de negocio   │
└─────────────────────────────────────────────────────────────┘
```

Los paquetes: `@taia/types` (tipos de dominio, sin dependencias), `@taia/domain` (reglas puras), `@taia/core`, `@taia/runtime`, y las apps `web`, `mcp`, `cli` y `docs`.

**Stack:** Next.js 16 y React 19 con Tailwind 4, Zustand, `@hello-pangea/dnd` y next-intl (español y portugués) en la web; PostgreSQL 17, Zod y un bus de eventos en el core; WebSocket nativo para el tiempo real; el SDK oficial de MCP; Vitest, Turborepo y pnpm en el monorepo.

## Qué vive dónde

**En el core**, todo lo que describe *qué hace TAIA*, sin importar quién ejecute a los agentes:

- tareas, subtareas, dependencias, columnas, workspaces y presets;
- costos, estadísticas, actividad, alertas y trayectorias;
- worktrees y QA pipeline;
- el esquema de la base, las migraciones y la validación;
- el WebSocket hacia la UI;
- las instancias de runtime y el pool de adapters: cada agente corre en su instancia o en la default ([ADR-006](/taia/arquitectura/adr/006-named-runtime-instances/)). Los listados (sesiones, squad, costos, modelos, health) consultan todas las instancias en paralelo con un timeout por instancia, así que una caída no tumba el resto.

**En un adapter**, todo lo que describe *cómo hablar con un runtime concreto*:

| Responsabilidad | Métodos | Capacidad |
|---|---|---|
| Listar agentes, health | `listAgents`, `getHealth` | (siempre) |
| Sesiones | `spawnSession`, `listSessions`, `sendToSession`, `awaitSessionComplete` | `Sessions` |
| Transcripciones | `getSessionHistory` | `Transcripts` |
| Eventos en vivo | `on(event, handler)` | `LiveEvents` |
| Cron | `listCrons`, `cronAction` | `Cron` |
| Aprobaciones | flujo de aprobación de herramientas (Anthropic, OpenClaw) | `Approvals` |
| Mensajes a canales externos | `sendChannelMessage` | `Messaging` |
| Contexto como archivos | `projectAgentContext`, `syncAgentContext` | `ContextSync` |
| Settings por agente | `getRuntimeSettings` | `RuntimeSettingsRead` |
| Alta y edición de agentes | `provisionAgent`, `updateAgentSettings`, `deprovisionAgent`, `setRuntimeDefaults` | `AgentProvisioning` |
| Config cruda (vía de escape) | `getNativeConfig`, `patchNativeConfig` | `NativeConfig` |
| Convenciones del runtime | `getProviderDefaults` | (opcional) |

Si un servicio necesita una capacidad que el adapter no declara, falla con un `RuntimeCapabilityError` claro, y la UI muestra que el runtime activo no la soporta.

## Tipos canónicos

Los servicios consumen tipos de `@taia/runtime`, nunca la forma nativa de un runtime: `RuntimeAgent`, `RuntimeSession`, `RuntimeMessage`, `RuntimeCronJob`, `RuntimeHealth`, `RuntimeConnectionState`, `RuntimeSettingsSnapshot`, `RuntimeAgentSpec`, `ProvisionOutcome` y `SpawnResult` (con `sessionKey`, no `childSessionKey`). Cada adapter mapea su forma nativa en `mappers.ts`.

## Antipatrones que se rechazan en review

| Mal | Bien |
|---|---|
| Importar `@taia/core` desde un adapter | El adapter es transporte; el core lo consume |
| Devolver un tipo nativo desde un servicio | Mapearlo a un tipo canónico en el adapter |
| Rutas del runtime hardcodeadas en el core (`/home/node/.openclaw/...`) | Que el runtime elija sus rutas (`provisionAgent` sin `workspace`) |
| Generar `SOUL.md` u otro formato nativo en el core | El renderer del adapter proyecta el bundle de contexto |
| Leer o escribir `openclaw.json` desde el core | `getRuntimeSettings` / `updateAgentSettings`; `NativeConfig` solo como vía de escape |
| `if (adapter.id === 'openclaw')` en el core | Una capacidad nueva |
| Lógica de tareas en el adapter | El adapter reporta; el core decide |
| Asumir que todos los runtimes tienen WebSocket | `LiveEvents` es opcional y la feature degrada |
| Renombrar una clave de settings sin migración | Migración nueva, con fallback |

## Cómo se controla

1. **Dependencias entre capas:** `pnpm test:architecture` (dependency-cruiser) falla si `@taia/runtime` o un adapter importa `@taia/core`, `@taia/domain` o las apps.
2. **Tests de contrato:** los adapters corren `runAdapterContract` (`packages/runtime/__tests__/contract/`).
3. **Nombres de runtimes en el core:** `grep -rn openclaw packages/core/src` solo puede encontrar el wiring de adapters (`runtime.ts`, `openclaw-wiring.ts`) y comentarios. Cualquier otra aparición es un olor.

## Modelo de contexto

Cada agente tiene un `AgentContextBundle` tipado (`agent`, `project`, `user`, `task`, `memory`), y cada adapter lo traduce a su formato: archivos del workspace en OpenClaw, bloques de system prompt en Anthropic y un único prompt en los CLI. Detalle en [Modelo de contexto](/taia/arquitectura/modelo-de-contexto/).
