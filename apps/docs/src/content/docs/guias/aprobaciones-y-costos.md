---
title: Aprobaciones y costos
description: Controlar qué ejecutan los agentes y cuánto cuestan.
sidebar:
  order: 5
---

## Aprobaciones

Con un runtime que soporta `approvals` (OpenClaw y Claude por API), un agente puede pedir permiso antes de ejecutar ciertas herramientas. Cada pedido queda `pending` hasta que alguien decide, o vence (`timed_out`).

Hoy se manejan **por API**, porque la UI todavía no tiene una bandeja de aprobaciones:

```bash
# pendientes
curl 'http://localhost:13333/api/approvals?status=pending'

# aprobar o rechazar
curl -X POST http://localhost:13333/api/approvals/<id>/decide \
  -H 'content-type: application/json' \
  -d '{"decision": "approved", "reason": "ok", "decided_by": "admin"}'
```

`GET /api/approvals` también filtra por `agent_id`.

## Costos

TAIA registra los tokens y el costo de cada sesión cuando el runtime los informa: OpenClaw y Claude por API, que incluye los tokens de cache. Los CLI todavía no reportan costos.

- **Dashboard:** la página **Dashboard** muestra el costo por período, por agente y por tarea.
- **API:** `GET /api/cost/dashboard?period=…` devuelve las métricas, y `POST /api/cost/sync` sincroniza las sesiones del runtime. Cada agente y cada tarea tienen también su costo en `/api/agents/<id>/cost` y en la tarea.

Los precios por modelo salen del registro de modelos de `@taia/runtime/models`.
