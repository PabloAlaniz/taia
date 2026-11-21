---
title: Glosario
description: Los términos de TAIA en una página.
sidebar:
  order: 3
---

| Término | Qué es |
|---|---|
| **Adapter** | Implementación de `AgentRuntimeAdapter` para un runtime concreto. Vive en `packages/runtime/src/adapters/<runtime>/`. |
| **Agente** | Miembro del equipo (IA o persona) que recibe tareas. Ver [Agentes y runtimes](/taia/conceptos/agentes-y-runtimes/). |
| **Aprobación** | Pedido de un agente para ejecutar una herramienta, que alguien aprueba o rechaza. |
| **Bundle de contexto** | El `AgentContextBundle`: las cinco capas (`agent`, `project`, `user`, `task`, `memory`) que describen a un agente y su trabajo. |
| **Capa** | Una de las cinco partes del bundle de contexto (`agent`, `project`, `user`, `task`, `memory`). |
| **Capacidad** | Algo que un runtime declara que sabe hacer (`sessions`, `cron`, `approvals`…). TAIA solo usa las declaradas. |
| **Columna** | Etapa del tablero de un workspace. Su slug es el `status` de las tareas. |
| **Columna inicial / terminada** | Donde caen las tareas nuevas / las que cuentan como hechas. |
| **Default (instancia)** | La instancia en la que corren los agentes que no tienen una asignada. |
| **Dependencia** | Relación "esta tarea está bloqueada por aquella". |
| **Heartbeat** | Sesión programada con la que el runtime despierta a un agente para revisar su trabajo. |
| **Instancia** | Un runtime configurado: provider más su configuración. |
| **MCP** | Model Context Protocol. TAIA expone un servidor MCP para que los agentes usen el tablero. |
| **Preset** | Plantilla de columnas para crear un workspace. |
| **Proyección** | El contexto de un agente renderizado al formato nativo de su runtime (por ejemplo, `SOUL.md` en OpenClaw). |
| **Provider** | El tipo de runtime: `openclaw`, `anthropic`, `claude-code`, `aider`, `cursor` o `none`. |
| **QA pipeline** | Comandos que se corren sobre el worktree de una tarea para validarla. |
| **Renderer** | La parte de un adapter que traduce el bundle de contexto al formato de su runtime. |
| **Runtime** | Lo que ejecuta a los agentes. |
| **Sesión** | Una ejecución de un agente en el runtime. |
| **Standalone** | TAIA sin runtime: tablero, MCP y CLI. |
| **Transcripción** | El historial de mensajes y tool calls de una sesión. |
| **Versión** | Una fila de `*_versions` que congela el contenido de una capa del contexto (identidad, proyecto o usuario). |
| **Workspace** | Un tablero independiente, con sus columnas, tareas y agentes. `ws-default` es el que se crea al arrancar. |
| **Worktree** | Un git worktree por tarea, para que un agente trabaje aislado y después se haga merge. |
