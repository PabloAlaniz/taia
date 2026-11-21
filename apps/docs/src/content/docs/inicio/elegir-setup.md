---
title: Elegí tu setup
description: Con o sin runtime, y cuál conviene según cómo trabajan tus agentes.
---

TAIA no tiene un runtime "oficial". Elegís uno en **Ajustes › Runtime** (o en el asistente inicial), lo probás con **Probar conexión** y lo dejás activo con **Guardar y activar**. Podés cambiarlo cuando quieras sin perder tareas.

## Sin runtime (standalone)

Tus agentes corren donde ya corren (Claude Code en tu terminal, Cursor, un script propio) y usan TAIA como tablero compartido por [MCP](/taia/guias/cliente-mcp/) o por la [API REST](/taia/referencia/api/). TAIA no maneja su ciclo de vida.

**Funciona:** Kanban, tareas, subtareas, dependencias, workspaces, actividad, alertas en el tablero, worktrees, la CLI y el servidor MCP.

**No funciona:** transcripciones en vivo, cron, sync de costos por sesión, alta de agentes en un runtime y el asistente de planificación. En esas pantallas la UI muestra "Sin runtime — modo standalone".

Es el setup más simple y alcanza si usás TAIA como capa de coordinación.

## Con un runtime

El runtime es lo que **ejecuta** a los agentes. Cada uno aporta capacidades distintas; la matriz completa está en [Runtimes](/taia/runtimes/).

| Si tus agentes… | Elegí | Qué necesitás |
|---|---|---|
| Viven en un gateway de OpenClaw | [OpenClaw](/taia/runtimes/openclaw/) | La URL del gateway y su `gateway.auth.token` |
| Pueden correr con la API de Anthropic | [Claude (API)](/taia/runtimes/anthropic/) | Una API key de Anthropic |
| Son Claude Code o Aider en la misma máquina que TAIA | [Claude Code](/taia/runtimes/claude-code/) / [Aider](/taia/runtimes/aider/) | El CLI instalado donde corre el server |

OpenClaw es el más completo (cron, aprobaciones, mensajería, alta de agentes). La API de Anthropic no necesita ningún proceso externo. Los CLI son lo más rápido de probar si ya los tenés instalados.

:::note[Una instancia por tipo de runtime]
Hoy la UI configura una instancia por tipo de runtime (una de OpenClaw, una de Anthropic, etc.) y una de ellas es la activa. El modelo de datos ya soporta varias instancias con nombre y agentes asignados a cada una; la pantalla para gestionarlas está en el [roadmap](/taia/roadmap/).
:::

## Escribir tu propio adapter

Si usás un runtime que TAIA no trae, se integra implementando la interfaz `AgentRuntimeAdapter`. Ver [Escribir un adapter](/taia/runtimes/escribir-un-adapter/).
