---
title: API REST
description: Cómo está organizada la API y los endpoints principales.
sidebar:
  order: 3
---

La API vive en `http://localhost:13333/api`. El listado completo de rutas y métodos está en el [índice de rutas](/taia/referencia/rutas-api/), generado desde el código.

:::caution
Por defecto la API no pide credenciales: cualquiera que llegue al puerto puede usarla entera. Con `TAIA_API_TOKEN` en el servidor, cada request necesita `Authorization: Bearer <token>` (o `X-API-Key: <token>`); sin él responde `401`. Quedan abiertas `GET /api/health` y `POST /api/webhooks/incoming`, que valida su propia firma. Ver [token de acceso](/taia/guias/deploy/#token-de-acceso) y [SECURITY](https://github.com/PabloAlaniz/taia/blob/main/.github/SECURITY.md).
:::

## Convenciones

- Todo es JSON. Muchas rutas responden `{ ok: true, ... }`, pero no todas: algunas devuelven el objeto directo (por ejemplo, `POST /api/tasks` devuelve `{ task }`). Los errores vienen como `{ error, code? }` con un status 4xx o 5xx.
- El workspace va en `?workspace_id=` o en el header `x-workspace-id`. Lo que se crea sin workspace va a `ws-default`; los listados sin filtro devuelven todos los workspaces.
- Los cambios se registran con un actor: `created_by` o `agentId` en el body, o `x-taia-actor` en settings.

## Tareas

| Endpoint | Método | Para qué |
|---|---|---|
| `/api/tasks` | `GET` | Listar. Filtros: `status`, `project`, `project_id`, `assigned_to`, `priority`, `q`, `workspace_id`, `done_since_days` |
| `/api/tasks` | `POST` | Acciones: `{ "action": "create", "task": {…} }`, `{ "action": "move", "taskId", "status" }`, `{ "action": "update", "taskId", "updates": {…} }` |
| `/api/tasks/[id]` | `GET`, `PUT` (o `PATCH`), `DELETE` | Leer, actualizar y borrar |
| `/api/tasks/assign` | `POST` | Asignar a un agente |
| `/api/tasks/[id]/subtasks` | `GET`, `POST`, `PUT` | Subtareas (`PUT` reordena) |
| `/api/tasks/[id]/subtasks/[sid]` | `PUT`, `DELETE` | Una subtarea |
| `/api/tasks/[id]/dependencies` | `GET`, `POST`, `DELETE` | Dependencias (con detección de ciclos) |
| `/api/tasks/[id]/messages` | `GET`, `POST` | Hilo de la tarea |
| `/api/tasks/[id]/tags` | `POST`, `DELETE` | Tags |
| `/api/tasks/[id]/trajectories` | `GET`, `POST` | Historial de cambios |
| `/api/tasks/[id]/cost` | `GET` | Costo de la tarea |

El `status` tiene que ser una columna del workspace de la tarea; si no, la API responde `400 INVALID_STATUS` ([Workspaces y columnas](/taia/conceptos/workspaces-y-columnas/)).

## Workspaces y columnas

`/api/workspaces` (`GET`, `POST`), `/api/workspaces/[id]` (`GET`, `PUT`, `DELETE`), `/api/workspaces/[id]/columns` (`GET`, `POST`), `/api/workspaces/[id]/columns/[columnId]` (`PUT`, `DELETE`), `/api/workspaces/[id]/columns/reorder` (`POST`) y `/api/workspaces/presets` (`GET`).

## Agentes

| Endpoint | Método | Para qué |
|---|---|---|
| `/api/agents` | `GET`, `POST` | Listar (con datos del runtime de cada uno) y crear |
| `/api/agents/[id]` | `GET`, `PUT`, `DELETE` | Un agente |
| `/api/agents/[id]/context` | `GET`, `PATCH` | Identidad y contexto (con versiones en `/versions`) |
| `/api/agents/[id]/runtime-settings` | `GET`, `PATCH` | Modelo y tools del agente en su runtime |
| `/api/agents/[id]/transcript`, `/live`, `/stream` | `GET` | Transcripción y eventos en vivo |
| `/api/agents/[id]/trigger` | `POST` | Despertar al agente ahora. Si ya corre, devuelve esa sesión con `coalesced: true` (con `TAIA_AGENT_RUN_LOCK=enforce`); `?force=1` lanza otra igual. Ver [Cron y heartbeats](/taia/guias/cron-y-heartbeats/#una-corrida-a-la-vez) |
| `/api/agents/[id]/cron` | `GET`, `POST`, `PATCH`, `DELETE` | Heartbeat ([Cron](/taia/guias/cron-y-heartbeats/)) |
| `/api/agents/[id]/memory`, `/working-state` | `GET`, `PUT` | Memoria y estado de trabajo |
| `/api/agents/[id]/cost` | `GET` | Costo del agente |

## Runtime y sesiones

`/api/runtime/health` (estado de cada instancia y un agregado), `/api/sessions`, `/api/sessions/active`, `/api/sessions/[key]/history` (`?instance=`), `/api/models`, `/api/gateway/config` (config cruda, `?instance=`) y `/api/settings/test-connection` (`POST`).

## Otros

- **Proyectos:** `/api/projects` y `/api/projects/[id]`, con `/context`, `/repositories` y `/overview` (las tareas del proyecto agrupadas por workspace). Los proyectos cruzan workspaces: `GET /api/projects` ignora `x-workspace-id` y lista todos; `?workspace_id=` devuelve los que tienen tareas en ese workspace (o lo tienen como workspace de origen).
- **Filtros, templates y tags:** `/api/filters`, `/api/templates`, `/api/tag-colors`.
- **Planificación, QA, webhooks e importación:** ver las [guías](/taia/guias/planificacion/).
- **Aprobaciones y costos:** `/api/approvals`, `/api/cost/dashboard` y `/api/cost/sync`.
- **Actividad y métricas:** `/api/activities`, `/api/stats`, `/api/usage-analytics` y `/api/standup` (`GET`, texto o `?format=json`).
- **Settings:** `/api/settings` (`GET`, `PUT`, `DELETE`; las claves sensibles vuelven enmascaradas) y `/api/settings/audit`.
- **Salud:** `/api/health`, `/api/health/migrations`, `/api/health/event-bus` y `/api/runtime-target`.

## WebSocket

El navegador se conecta a `ws://localhost:13334` (en producción, `wss://<dominio>/ws` vía Caddy) y recibe mensajes `{ type, payload, timestamp }`:

| Evento | Cuándo |
|---|---|
| `connected` | Al conectarse |
| `task:created`, `task:updated`, `task:moved`, `task:deleted` | Cambios en tareas |
| `agent:status` | Cambio de estado de un agente |
| `activity:new` | Nueva entrada de actividad |
| `worktree:created`, `worktree:updated`, `worktree:merged` | Worktrees |
| `dependency:added`, `dependency:removed` | Dependencias |

Es solo de lectura: el servidor no reenvía mensajes que mandan los clientes.
