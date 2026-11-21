---
title: Runtimes soportados
description: Qué aporta cada runtime y cómo se comparan.
sidebar:
  label: Resumen y matriz
  order: 0
---

Cada runtime es un adapter de `@taia/runtime` (`packages/runtime/src/adapters/<runtime>/`) que implementa `AgentRuntimeAdapter` y **declara sus capacidades**. El core solo pregunta `adapter.capabilities.has(...)`, nunca qué runtime es.

Se configura en **Ajustes › Runtime**: elegís el tipo, completás los datos, **Probar conexión** y **Guardar y activar**.

## Matriz de capacidades

| Capacidad | [OpenClaw](/taia/runtimes/openclaw/) | [Claude (API)](/taia/runtimes/anthropic/) | [Claude Code](/taia/runtimes/claude-code/) | [Aider](/taia/runtimes/aider/) | [Cursor](/taia/runtimes/cursor/) | Standalone |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `sessions`: crear y listar sesiones | ✅ | ✅ | ✅ | ✅ | — | — |
| `transcripts`: historial de una sesión | ✅ | ✅ | ✅ | ✅ | — | — |
| `live_events`: eventos en vivo | ✅ | ✅ | — | — | — | — |
| `health`: estado de la conexión | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `approvals`: aprobar tool calls | ✅ | ✅ | — | — | — | — |
| `cron`: heartbeats programados | ✅ | — | — | — | — | — |
| `messaging`: canales externos (alertas) | ✅ | — | — | — | — | — |
| `context_sync`: contexto como archivos nativos | ✅ | — | — | — | — | — |
| `runtime_settings_read`: modelo y tools por agente | ✅ | — | — | — | — | — |
| `agent_provisioning`: alta y edición de agentes | ✅ | — | — | — | — | — |
| `native_config`: config cruda del runtime | ✅ | — | — | — | — | — |

Claude por API y los CLI no sincronizan archivos: reciben el contexto del agente en cada request. Claude, como bloques del system prompt; los CLI, como un único prompt. Ver [Modelo de contexto](/taia/arquitectura/modelo-de-contexto/).

## Tipos de runtime

| Tipo | Runtimes | Dónde corre el agente | Lo que guarda TAIA |
|---|---|---|---|
| Gateway | OpenClaw | En el gateway, que puede estar en otra máquina | URL, token e identidad del dispositivo emparejado |
| API | Claude (API de Anthropic) | Dentro de TAIA, que corre el loop de tools contra la Messages API | API key y modelo |
| CLI local | Claude Code, Aider, Cursor | En un subproceso del servidor de TAIA | Comando, directorio y modo de prompt |
| Ninguno | Standalone | Donde quieras; los agentes usan TAIA por MCP o REST | Nada |

## URL de TAIA para los agentes

Los agentes que no tienen herramientas nativas de TAIA llegan al tablero por HTTP. La URL sale de `TAIA_URL` (por defecto `http://localhost:13333`) y en Claude por API se puede cambiar por instancia. Si los agentes corren en otra máquina, poné la URL pública.

## Dónde viven los secretos

La configuración no secreta de cada instancia va en la tabla `runtime_instances`. Los secretos (token, API key, identidad del dispositivo) van en `settings`, bajo `runtime.instances.<id>.*`. La API los devuelve enmascarados, y en la base se guardan cifrados si definís `TAIA_SECRET_KEY` (ver [configuración](/taia/referencia/configuracion/)).
