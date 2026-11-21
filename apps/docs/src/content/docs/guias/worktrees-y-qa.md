---
title: Worktrees y QA pipeline
description: Un git worktree por tarea para que cada agente trabaje aislado, y comandos de validación antes del merge.
sidebar:
  order: 3
---

## Worktrees

Cuando una tarea tiene un proyecto con repositorio, TAIA puede crear un **git worktree** para ella: una copia de trabajo en su propia rama, donde un agente puede trabajar sin pisar a los demás.

**Ciclo:**

1. **Crear:** desde el panel de la tarea, con `taia_create_worktree` o con `POST /api/worktrees`. Con *Auto-crear al asignar* activado, se crea solo cuando se asigna la tarea.
2. **Trabajar:** el agente trabaja en la ruta del worktree. `taia_worktree_status` muestra el estado.
3. **Revisar el diff:** `taia_worktree_diff` o `GET /api/worktrees/<id>/diff`. La UI todavía no tiene visor de diff.
4. **Merge:** desde el panel de la tarea, con `taia_merge_worktree` o con `POST /api/worktrees/<id>` y `{ "action": "merge", "strategy": "merge" | "squash" | "rebase" }`. Otras acciones: `review`, `abort`, `cleanup`.
5. **Limpieza:** con *Auto cleanup*, los archivos del worktree se borran después del merge. Además, los worktrees viejos se limpian a las N horas.

**Configuración** (en **Ajustes › Worktrees** o por variables de entorno; ver [Configuración](/taia/referencia/configuracion/#worktrees)):

| Ajuste | Variable | Default |
|---|---|---|
| Ruta de los worktrees | `WORKTREE_BASE_PATH` | `/tmp/taia-worktrees` |
| Ruta de los clones | `WORKTREE_REPO_PATH` | `/tmp/taia-repos` |
| Limpieza después de (horas) | `WORKTREE_CLEANUP_HOURS` | `72` |
| Auto cleanup al mergear | `WORKTREE_AUTO_CLEANUP` | activado |
| Auto-crear al asignar | `WORKTREE_AUTO_CREATE` | desactivado |
| Comando de setup | `WORKTREE_SETUP_CMD` | ninguno |

El **comando de setup** (por ejemplo `pnpm install`) se corre en cada worktree nuevo. Por seguridad, el comando y las dos **rutas** salen solo del entorno; editarlos desde la UI requiere `TAIA_ALLOW_REMOTE_COMMANDS=1` en el servidor.

:::note[En Docker]
Las rutas viven dentro del contenedor, que corre como el usuario `node`. Para que los worktrees sobrevivan a un reinicio, montá un volumen escribible y apuntá las rutas ahí con `WORKTREE_BASE_PATH` y `WORKTREE_REPO_PATH` en tu `.env` (el compose las pasa a los contenedores).
:::

## QA pipeline

El QA pipeline corre una lista de comandos en el worktree activo de una tarea y guarda el resultado y los logs de cada paso. Por ahora se usa **solo por API**:

```bash
# correr el pipeline sobre la tarea
curl -X POST http://localhost:13333/api/qa-pipeline \
  -H 'content-type: application/json' -d '{"task_id": "<id>"}'

# ver las corridas
curl 'http://localhost:13333/api/qa-pipeline?task_id=<id>'
```

**Los pasos salen del entorno del servidor**, no del request:

- `TAIA_QA_STEPS`: array JSON, por ejemplo `[{"id":"test","command":"pnpm test","timeout_ms":600000}]`.
- Sin esa variable, se corren `git status --short` y `git diff --check`.

Mandar `steps` en el request devuelve `403`, salvo con `TAIA_ALLOW_REMOTE_COMMANDS=1`, pensado para un host de confianza de un solo usuario. Los artefactos se guardan en `TAIA_QA_ARTIFACTS_DIR` (por defecto, `.taia/qa-runs` bajo el directorio de la app).

Si un paso falla, los siguientes se marcan como salteados.
