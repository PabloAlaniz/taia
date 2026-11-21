---
title: Claude (API de Anthropic)
description: Correr los agentes con la Messages API, sin procesos externos.
sidebar:
  order: 2
---

**Tipo:** API · **Provider:** `anthropic` · **Adapter:** `packages/runtime/src/adapters/anthropic/`

No hay proceso externo: TAIA corre el loop del agente. Llama a la Messages API con `@anthropic-ai/sdk`, ejecuta las herramientas de TAIA y guarda sesiones y transcripciones en su base ([ADR-002](/taia/arquitectura/adr/002-anthropic-adapter-design/)).

## Configurar

En **Ajustes › Runtime**, elegí **Claude (API de Anthropic)**, pegá la API key y, si querés, elegí un modelo por defecto. **Probar conexión** y **Guardar y activar**.

## Configuración

| Campo | Notas |
|---|---|
| API key | Secreto, enmascarado por la API |
| Modelo | Modelo por defecto. Cada agente puede tener el suyo |
| URL de TAIA | Con la que las herramientas del agente llaman a TAIA. Por defecto, `TAIA_URL` |

## Qué habilita

Sesiones, transcripciones, eventos en vivo (streaming) y [aprobaciones](/taia/guias/aprobaciones-y-costos/), activas por defecto para las herramientas que lo requieren.

El contexto del agente va como bloques del system prompt con cache, renderizados en cada request. Los tokens de cada sesión (incluido el cache) alimentan los [costos](/taia/guias/aprobaciones-y-costos/#costos).

## Limitaciones

- Sin cron ni mensajería: no hay un proceso que despierte al agente por su cuenta.
- Sin alta de agentes en el runtime: los agentes existen solo en TAIA.
