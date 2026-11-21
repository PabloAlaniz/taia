---
title: CLI
description: El comando taia para manejar tareas desde la terminal.
sidebar:
  order: 4
---

La CLI vive en `tools/cli` y habla con la API de TAIA por HTTP. Desde el repo:

```bash
pnpm taia status
```

También se puede correr el wrapper directamente (`tools/cli/src/taia`, que usa `tsx`) o agregarlo al `PATH`. La URL de la API se cambia con `TAIA_API` (por defecto, `http://localhost:13333`).

## Comandos

| Comando | Alias | Qué hace |
|---|---|---|
| `taia status` | `s` | Resumen: tareas en curso, asignadas y en revisión |
| `taia list [status]` | `ls` | Lista tareas, opcionalmente de una columna (`taia list in_progress`) |
| `taia show <id>` | | Detalle de una tarea |
| `taia begin <id>` | `start`, `b` | La mueve a `IN_PROGRESS` y empieza a contar tiempo |
| `taia pause <id>` | `p` | La vuelve a `ASSIGNED` y guarda el tiempo trabajado |
| `taia done <id>` | `d` | La mueve a `DONE` |
| `taia block <id>` | | Le agrega el tag `blocked` |
| `taia assign <id> <agente>` | `a` | La asigna a un agente |
| `taia create "<título>"` | `c` | Crea una tarea en la columna inicial |
| `taia help` | `-h`, `--help` | Ayuda |

Los ids aceptan un prefijo: `taia done abc` encuentra la tarea que empieza con `abc`.

## Limitaciones

- No permite elegir workspace: lista las tareas de todos y crea en `ws-default`.
- `begin`, `pause` y `done` usan los slugs del preset Software Dev (`IN_PROGRESS`, `ASSIGNED`, `DONE`). En workspaces con otras columnas, la API rechaza el cambio con `400 INVALID_STATUS`.

Para trabajar con cualquier workspace, usá las [herramientas MCP](/taia/referencia/herramientas-mcp/) o la [API](/taia/referencia/api/).
