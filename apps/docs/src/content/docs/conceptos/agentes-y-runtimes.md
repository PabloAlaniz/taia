---
title: Agentes, runtimes e instancias
description: Quién hace el trabajo y dónde corre.
sidebar:
  order: 2
---

## Agentes

Un **agente** es un miembro del equipo: tiene id, nombre, rol, avatar y tipo (`cron`, `api`, `human` u `orchestrator`). Las personas también se registran como agentes de tipo `human`. La página **Squad** muestra a todos con su estado.

A un agente se le asignan tareas, escribe en los hilos y puede tener:

- **Identidad y contexto:** quién es, cómo trabaja, el proyecto y el usuario para el que trabaja. TAIA lo arma en capas y cada runtime lo recibe en su formato. Ver [Modelo de contexto](/taia/arquitectura/modelo-de-contexto/).
- **Memoria:** notas que el agente escribe y TAIA guarda.
- **Settings de runtime:** modelo y tools por agente, cuando el runtime lo soporta.

## Runtimes y adapters

El **runtime** es lo que ejecuta a los agentes: un gateway de OpenClaw, la API de Anthropic, Claude Code, Aider o Cursor. TAIA habla con cada uno a través de un **adapter**, que implementa la interfaz `AgentRuntimeAdapter`.

Cada adapter declara sus **capacidades** (`sessions`, `transcripts`, `cron`, `approvals`, etc.). TAIA solo usa lo que el runtime declara. Si una pantalla necesita una capacidad que el runtime activo no tiene, la UI lo dice ("El runtime activo no expone esta información") en vez de fallar. La matriz completa está en [Runtimes](/taia/runtimes/).

Sin runtime, TAIA funciona en [modo standalone](/taia/inicio/elegir-setup/#sin-runtime-standalone).

## Instancias

Un runtime se configura como una **instancia**: un provider (por ejemplo `openclaw`) más su configuración (URL, token, comando…). Una instancia es la **default**, y cada agente corre en la instancia que tiene asignada o, si no tiene, en la default.

Hoy la UI maneja una instancia por tipo de runtime, con el mismo id que el provider. El modelo ya admite varias instancias del mismo tipo ([ADR-006](/taia/arquitectura/adr/006-named-runtime-instances/)); la pantalla para crearlas y asignar agentes está en el [roadmap](/taia/roadmap/). Los listados (sesiones, squad, costos, health) ya consultan todas las instancias configuradas en paralelo, y una que no responde no vacía el tablero.

## Sesiones y transcripciones

Una **sesión** es una ejecución de un agente en el runtime: un turno de trabajo sobre una tarea, un heartbeat o una conversación. La **transcripción** es el historial de mensajes y tool calls de esa sesión, y se ve en vivo cuando el runtime soporta `live_events`.

## Heartbeats y cron

Un **heartbeat** es una sesión programada: el runtime despierta al agente cada cierto tiempo para que revise sus tareas. Los programa el runtime (capacidad `cron`; hoy, OpenClaw). En la UI se activan y se cambia el horario; ver [Cron y heartbeats](/taia/guias/cron-y-heartbeats/).

## Aprobaciones

Con runtimes que soportan `approvals`, un agente puede pedir permiso antes de ejecutar ciertas herramientas. La solicitud queda pendiente hasta que alguien la aprueba o la rechaza. Ver [Aprobaciones y costos](/taia/guias/aprobaciones-y-costos/).
