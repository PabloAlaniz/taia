---
title: Solución de problemas
description: Los problemas más comunes y cómo resolverlos.
---

## El tablero no se actualiza en vivo

El navegador no llega al WebSocket.

1. Revisá qué URL recibe el navegador: `curl http://<host>/api/config/client`. No puede ser `localhost` si entrás desde otra máquina.
2. Corregila con `WS_CLIENT_URL` (en producción, `wss://<dominio>/ws` con TLS o `ws://<ip>/ws` sin TLS) o en **Ajustes › General**.
3. Probalo con dos pestañas: mové una tarea en una y fijate que la otra cambie sola.

## La app y el servidor MCP no ven las mismas tareas

Si el tablero muestra unas tareas y tus agentes (por MCP) ven otras, los dos servicios apuntan a bases distintas o uno de ellos quedó viejo:

```bash
bash scripts/dev/check-local-stack.sh          # health, tareas y MCP, todo junto
pnpm check:runtime-target                       # solo la comparación app ↔ MCP
```

El diagnóstico compara la identidad de la base (como hashes; `TAIA_EXPOSE_DB_IDENTITY=1` muestra los valores reales), si existe el workspace y cuántas tareas hay. Cuando no coinciden, imprime los campos distintos y los pasos para corregirlo.

**Causas habituales:**

- **Contenedores viejos:** si `GET /api/runtime-target` da `404`, lo que corre en el puerto 13333 es anterior a esa ruta. Recreá el stack: `docker compose down && docker compose up -d --build`.
- **Variables distintas:** la app y el MCP con distintos `DATABASE_URL` o `POSTGRES_*`. En desarrollo, exportá las mismas en las dos terminales (`pnpm dev` y `pnpm -F @taia/mcp start:http`).
- **Varios stacks a la vez:** usá un nombre de proyecto (`-p`) y puertos distintos por stack ([Instalación](/taia/inicio/instalacion/#cambiar-puertos-o-correr-dos-stacks)).

## Puertos ocupados

`docker compose up` falla con "port is already allocated", o el WebSocket de `pnpm dev` dice que el puerto está en uso. Mirá qué proceso lo ocupa con `lsof -i :13333` (o el puerto que sea) y cerralo, o cambiá los puertos del host con `APP_PORT`, `WS_PORT`, `BROADCAST_PORT`, `MCP_PORT` y `POSTGRES_PORT`.

## OpenClaw pide aprobar el dispositivo

La primera conexión a un gateway devuelve "El runtime pide aprobar este dispositivo". Aprobalo en el gateway con `openclaw devices approve <requestId>` (el id aparece en el mensaje) o desde la Control UI, y volvé a **Probar conexión**. La aprobación queda guardada.

## Un runtime CLI aparece "sin configurar"

Si el comando guardado no es el binario del runtime, TAIA lo ignora por seguridad ([política de comandos](/taia/runtimes/claude-code/#política-de-comandos)). Usá el binario (`claude`, `aider`, `cursor-agent`) o definí `TAIA_CLI_COMMAND_<PROVIDER>` en el servidor.

## "Status … is not a column of workspace …"

La tarea se movió (o se creó) con un status que no es una columna de su workspace. Cada preset tiene sus slugs; consultalos con `taia_get_workspace_columns` o `GET /api/workspaces/<id>/columns`. Ver [Workspaces y columnas](/taia/conceptos/workspaces-y-columnas/).

## La app no arranca: "Migration drift detected"

El historial de migraciones de la base no coincide con el código.

- **Una migración aparece como `changed`:** alguien editó un archivo ya aplicado. Hay que volver a la versión original y poner el cambio en una migración nueva.
- **"already has TAIA tables but no taia_schema_migrations":** es una instalación previa a la primera versión pública. Arrancá con una base vacía ([Actualizar](/taia/guias/actualizar/)).

`pnpm check:migrations` y `GET /api/health/migrations` muestran el detalle.

## El MCP rechaza requests detrás de un proxy

El servidor MCP solo acepta ciertos `Host` (protección contra DNS rebinding). Agregá el nombre público con `MCP_ALLOWED_HOSTS`.
