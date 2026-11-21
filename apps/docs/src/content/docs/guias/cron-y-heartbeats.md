---
title: Cron y heartbeats
description: Despertar a los agentes de forma periódica para que revisen su trabajo.
sidebar:
  order: 4
---

Un **heartbeat** es una sesión programada: cada cierto tiempo, el runtime despierta a un agente con un mensaje que le pide revisar sus tareas en TAIA. La programación la hace el runtime, así que necesitás uno con la capacidad `cron`. Hoy lo soporta [OpenClaw](/taia/runtimes/openclaw/).

## Desde la UI

En **Agents**, el panel de cada agente permite:

- activar o desactivar el heartbeat;
- cambiar el horario, en formato cron (por ejemplo, `*/30 * * * *` para cada 30 minutos).

La zona horaria por defecto se configura en **Ajustes › General** (formato IANA, por ejemplo `America/Argentina/Buenos_Aires`). Si no está definida, se usa `CRON_DEFAULT_TZ` o, en su defecto, `UTC`.

## Por API

Lo demás está en la API, bajo `/api/agents/<id>/cron`:

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/api/agents/<id>/cron` | El job del agente |
| `POST` | `/api/agents/<id>/cron` | Crearlo |
| `PATCH` | `/api/agents/<id>/cron` | Cambiar `schedule`, `enabled` o el timeout |
| `DELETE` | `/api/agents/<id>/cron` | Borrarlo |
| `POST` | `/api/agents/<id>/cron/run` | Correrlo ahora |
| `GET` | `/api/agents/<id>/cron/history` | Las últimas corridas |

## Qué recibe el agente

El mensaje del heartbeat apunta al contexto del agente en TAIA. Con `context_sync: push` (default en OpenClaw), TAIA escribe los archivos de contexto en el workspace del agente. Con `pull`, el agente los pide a la API de TAIA al despertar. Ver [Modelo de contexto](/taia/arquitectura/modelo-de-contexto/).
