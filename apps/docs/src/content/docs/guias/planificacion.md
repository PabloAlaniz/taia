---
title: Asistente de planificación
description: Descomponer un objetivo en tareas con ayuda del runtime.
sidebar:
  order: 7
---

El **asistente de planificación** (botón en el header del tablero) toma un objetivo escrito en lenguaje natural y propone una lista de tareas con prioridad y descripción. Revisás la propuesta, la ajustás y creás las tareas de una vez.

## Qué necesita

El plan lo genera **el runtime activo**: TAIA abre una sesión, le pasa el objetivo y lee la respuesta. Por eso hace falta un runtime con las capacidades `sessions` y `transcripts`:

| Runtime | ¿Sirve? |
|---|---|
| OpenClaw, Claude (API), Claude Code, Aider | Sí |
| Cursor | No (no tiene sesiones) |
| Standalone | No |

No hay una API key aparte para el asistente: usa la configuración del runtime.

## Por API o MCP

- `POST /api/planning` con `{ "goal": "…" }` genera un plan. Con `{ "tasks": [...] }` crea las tareas aprobadas.
- `GET /api/planning` lista las corridas anteriores (`?task_id=` filtra por tarea).
- La herramienta MCP `taia_generate_plan` hace lo mismo desde un agente.
