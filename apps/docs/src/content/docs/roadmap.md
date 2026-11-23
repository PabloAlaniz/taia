---
title: Roadmap
description: Lo que viene, sin fechas.
---

Orientativo y sin fechas. Si algo te interesa, abrí un issue o comentá en el que ya existe.

## Ahora: paridad entre runtimes

Que elegir un runtime no implique perder funciones que no dependen de él.

- **Alta y baja de agentes:** crear o borrar un agente en TAIA lo crea o lo borra en su runtime, cuando el runtime soporta `agent_provisioning`.
- **Modelo por agente en los CLI:** que Claude Code y Aider usen el modelo configurado para cada agente.
- **Gestión de instancias:** crear, editar y borrar instancias desde la UI y asignar agentes a cada una.
- **Pantalla "Runtime" por agente:** instancia, modelo y tools, con la misma UI para cualquier runtime.

## Próximo

- **Usuarios y permisos:** hoy hay un único token de acceso compartido.
- **Protección SSRF** en las URLs de runtimes (los webhooks salientes ya la tienen, con la política de URLs de omniwebhook).
- **Sesiones de los CLI persistentes**, con tokens y costos.
- **UI para lo que hoy es solo API:** aprobaciones, QA pipeline, webhooks e importación de GitHub; además, el visor de diff de los worktrees.
- **Columnas dinámicas de punta a punta:** la CLI, la extensión de VS Code, el mapeo de los webhooks de GitHub y las métricas (standup, stats) todavía asumen los slugs del preset Software Dev.
- **Desacople total:** que ningún archivo fuera de `adapters/<runtime>/` conozca un runtime concreto, y una suite de contrato común para todos los adapters.

## Después

- Más runtimes (otros CLI y APIs de modelos).
- Adjuntos en tareas.
- Campos custom.
- Vista de ejecución paralela de agentes.
- Documentación en inglés.
