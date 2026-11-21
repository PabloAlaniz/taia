---
title: Cursor
description: Correr Cursor como subproceso del servidor de TAIA.
sidebar:
  order: 5
---

**Tipo:** CLI local · **Provider:** `cursor` · **Adapter:** `packages/runtime/src/adapters/cursor/`

**Experimental.** Tiene la misma forma que los adapters de Claude Code y Aider, pero por ahora solo declara `health`: TAIA verifica que el comando existe, pero todavía no crea sesiones.

## Configurar

1. Instalá el CLI en la máquina donde corre el servidor de TAIA. Con Docker, eso es dentro del contenedor: lo más simple es correr TAIA fuera de Docker o armar una imagen propia que lo incluya.
2. En **Ajustes › Runtime**, elegí **Cursor (CLI)**. **Probar conexión** corre `cursor --version`.
3. **Guardar y activar.**

## Configuración

| Campo | Notas |
|---|---|
| Comando | El binario a ejecutar. Por defecto, `cursor`. Ver la política de abajo |
| Directorio | Directorio de trabajo de las sesiones. `TAIA_CLI_CWD` en el servidor tiene prioridad |
| Modo de prompt | `arg` (default) o `stdin` |

### Política de comandos

El comando no puede ser cualquier programa: si lo fuera, cualquiera con acceso a la API podría ejecutar código en el servidor. Solo se acepta `cursor` o `cursor-agent`, sin argumentos o como ruta absoluta que termine en ese nombre (por ejemplo, `/usr/local/bin/cursor`).

Para usar otro binario o un wrapper, definí `TAIA_CLI_COMMAND_CURSOR` en el entorno del servidor. Ese valor tiene prioridad sobre lo que diga la UI. Si la instancia tiene guardado un comando fuera de la política, queda sin configurar hasta que lo cambies.

## Limitaciones

Sin sesiones ni transcripciones hasta que se valide un CLI de Cursor que corra sin interfaz.
