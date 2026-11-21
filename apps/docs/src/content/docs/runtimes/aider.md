---
title: Aider
description: Correr Aider como subproceso del servidor de TAIA.
sidebar:
  order: 4
---

**Tipo:** CLI local · **Provider:** `aider` · **Adapter:** `packages/runtime/src/adapters/aider/`

Lanza el binario `aider` con la capa compartida `GenericCliProtocol` (`adapters/cli/`). Cada sesión es una ejecución de `aider --message`.

## Configurar

1. Instalá el CLI en la máquina donde corre el servidor de TAIA. Con Docker, eso es dentro del contenedor: lo más simple es correr TAIA fuera de Docker o armar una imagen propia que lo incluya.
2. En **Ajustes › Runtime**, elegí **Aider (CLI)**. **Probar conexión** corre `aider --version`.
3. **Guardar y activar.**

## Configuración

| Campo | Notas |
|---|---|
| Comando | El binario a ejecutar. Por defecto, `aider`. Ver la política de abajo |
| Directorio | Directorio de trabajo de las sesiones. `TAIA_CLI_CWD` en el servidor tiene prioridad |
| Modo de prompt | `arg` (default) o `stdin` |

### Política de comandos

El comando no puede ser cualquier programa: si lo fuera, cualquiera con acceso a la API podría ejecutar código en el servidor. Solo se acepta `aider`, sin argumentos o como ruta absoluta que termine en ese nombre (por ejemplo, `/usr/local/bin/aider`).

Para usar otro binario o un wrapper, definí `TAIA_CLI_COMMAND_AIDER` en el entorno del servidor. Ese valor tiene prioridad sobre lo que diga la UI. Si la instancia tiene guardado un comando fuera de la política, queda sin configurar hasta que lo cambies.

## Qué habilita

Sesiones y transcripciones. El contexto del agente (identidad, proyecto, usuario, cómo llegar a TAIA y la tarea) va en un único prompt (`adapters/cli/context-prompt.ts`).

## Limitaciones

- Las sesiones viven en la memoria del proceso: se pierden al reiniciar TAIA.
- No reporta tokens ni costos.
- Todavía no usa el modelo configurado por agente (está en el [roadmap](/taia/roadmap/)).
- Corre con los permisos del usuario del servidor de TAIA.
