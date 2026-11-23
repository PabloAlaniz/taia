# Registro de cambios

Todos los cambios notables de TAIA se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y este proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Proyectos

- Los proyectos cruzan workspaces: un workspace es cómo se trabaja (sus columnas) y un proyecto es para quién o sobre qué (su contexto). Las tareas de un proyecto pueden estar en cualquier workspace, y borrar el workspace de origen ya no borra el proyecto (migración `0004`).
- La capa de proyecto del contexto de un agente sale del proyecto de la tarea en curso. Si la tarea no tiene proyecto, se usa la versión fijada o el proyecto del agente, como antes.
- Sección **Proyectos** con la vista de cada proyecto, sus tareas agrupadas por workspace (`GET /api/projects/[id]/overview`). `GET /api/projects` lista todos los proyectos sin importar `x-workspace-id`.
- El asistente inicial pide el primer proyecto (opcional) antes del primer workspace.

### Webhooks

- **Cambio incompatible:** los webhooks entrantes que no vienen de GitHub se firman con [Standard Webhooks](https://www.standardwebhooks.com/) (`webhook-id`, `webhook-timestamp` y `webhook-signature`). Las cabeceras `x-taia-webhook-*` ya no se aceptan. El secreto de cada workspace tiene que tener la forma `whsec_<base64>`.
- Los webhooks de GitHub se verifican con la firma que manda GitHub (`x-hub-signature-256` sobre el cuerpo). Antes se esperaba además un timestamp que GitHub no manda, así que una entrega real de GitHub se rechazaba.
- La verificación y la deduplicación de los webhooks entrantes las hace [omniwebhook](https://github.com/PabloAlaniz/omniwebhook). Cada evento se reserva en la tabla `omniwebhook_events` (migración `0005`) antes de procesarlo. Así dos entregas simultáneas del mismo evento no se aplican dos veces, y un fallo libera el evento para el reintento del emisor.
- `?dry_run=1` verifica y calcula sin consumir el evento.
- **Cambio incompatible:** los webhooks salientes se firman con [Standard Webhooks](https://www.standardwebhooks.com/) (`webhook-id`, `webhook-timestamp` y `webhook-signature`) en vez de `x-taia-signature`. El cuerpo es `{ type, timestamp, workspace_id, actor, data }`. Cada endpoint necesita un secreto `whsec_<base64>`, y `PUT /api/settings` rechaza endpoints mal formados.
- Los webhooks salientes ya no se entregan dentro de la request que causó el evento. Se encolan en `webhook_outbox` (migración `0007`) y el servidor web los entrega con [omniwebhook](https://github.com/PabloAlaniz/omniwebhook). Los reintentos llegan hasta 10 intentos en unas 27 horas y sobreviven a un reinicio. Cada intento queda en `omniwebhook_attempts` (migración `0006`).
- `410 Gone` desactiva el endpoint. Un reenvío manual usa el mismo `webhook-id`.
- La entrega se conecta a la dirección que validó la política de URLs, así que un DNS que cambia de respuesta ya no puede desviarla. `TAIA_WEBHOOK_ALLOWED_NETWORKS` permite redes puntuales; las de metadatos de las nubes nunca se permiten.
- Se borran los registros JSON de entregas que los webhooks guardaban en `settings`.

### Agentes

- Disparar a mano un agente que ya está corriendo no lanza otra corrida: devuelve la que está en curso (`coalesced: true`), y `?force=1` lanza otra igual. Arranca en modo sombra (`TAIA_AGENT_RUN_LOCK=shadow`, sólo loguea); `enforce` lo activa.
- Las operaciones que gastan en el modelo tienen límites: 20 corridas por hora por agente, 30 planes y 10 setups de onboarding por hora (`TAIA_AGENT_RUN_LIMIT`, `TAIA_PLANNING_LIMIT`, `TAIA_ONBOARDING_SETUP_LIMIT`). Frenan a un script o a un agente en bucle, no a una persona. Arrancan en modo sombra (`TAIA_SPEND_LIMITS=shadow`, sólo loguean lo que rechazarían); `enforce` responde `429`.

### Seguridad

- El freno de la pantalla de ingreso guarda la cuenta en Postgres, así que un reinicio no da intentos nuevos, y nunca verifica más tokens a la vez que los que quedan en el cupo. Si la base no puede contar, responde `503`.
- `POST /api/webhooks/incoming`, abierto sin token, admite 120 entregas por minuto por cliente (`TAIA_WEBHOOK_RATE_LIMIT`) y responde `429` antes de leer el cuerpo o tocar la base.
- `POST /api/webhooks/incoming` rechaza con `413` los cuerpos de más de 25 MiB (`TAIA_WEBHOOK_MAX_BYTES`) sin leerlos enteros.
- El servidor de WebSocket admite hasta 200 conexiones (`TAIA_WS_MAX_CLIENTS`), corta a los clientes que le mandan mensajes de más de 4 KiB y rechaza los broadcasts internos de más de 1 MiB (`TAIA_WS_MAX_BROADCAST_BYTES`).
- `POST /mcp` tiene un límite por cliente (600 por minuto, `TAIA_MCP_RATE_LIMIT`), contado antes del token para frenar también una ráfaga de tokens equivocados. Arranca en modo sombra (`TAIA_MCP_RATE_LIMIT_MODE=shadow`); `enforce` responde `429`.

## [v1.0.0-alpha.3] - 2026-11-21

Primera versión pública.

### Tablero

- Kanban con drag & drop, columnas dinámicas y presets (Software Dev, Marketing, Escritura, Ventas, Personalizado), con asistente de onboarding.
- Swimlanes, dependencias con detección de ciclos, subtareas, templates, filtros guardados con sincronización por URL, tags con color, límites WIP y vista calendario.
- Workspaces con sus propias tareas, actividad, proyectos, filtros y plantillas; alertas, notificaciones y actualizaciones en tiempo real por WebSocket.
- Git worktrees con merge y limpieza (el diff, por API). Por API: QA pipeline por worktree, aprobaciones, importación de issues de GitHub y webhooks entrantes y salientes.

### Agentes y runtimes

- Interfaz `AgentRuntimeAdapter` con capacidades declaradas. Hay adapters para OpenClaw (gateway), Claude (API de Anthropic), Claude Code, Aider y Cursor, más el modo standalone. Ver [Runtimes](https://pabloalaniz.github.io/taia/runtimes/).
- Instancias de runtime con nombre: cada agente corre en la suya o en la default, y los listados (sesiones, squad, costos, health) consultan todas las instancias en paralelo ([ADR-006](docs/adr/006-named-runtime-instances.md); la UI todavía configura una instancia por tipo de runtime).
- Contexto del agente en capas, que cada adapter renderiza a su formato nativo ([Modelo de contexto](https://pabloalaniz.github.io/taia/arquitectura/modelo-de-contexto/)).
- Transcripciones en vivo, cron, costos por sesión, aprobaciones, standups, trayectorias y memoria del agente.

### Integraciones

- Servidor MCP con 36 herramientas `taia_*`, por stdio o HTTP (`http://localhost:13336/mcp`).
- CLI `taia` y extensión de VS Code.
- Asistente de planificación, que corre sobre el runtime activo.

### Operación

- Docker Compose con Caddy y TLS para producción, con override para PostgreSQL gestionado; imagen en GHCR (`ghcr.io/pabloalaniz/taia`).
- Documentación en [pabloalaniz.github.io/taia](https://pabloalaniz.github.io/taia/).
- Migraciones con tracking: cada archivo de `packages/core/migrations/` corre una sola vez, con checksum, a partir de `0001_baseline.sql`. `pnpm check:migrations` y `GET /api/health/migrations` detectan drift.

### Seguridad

Con `TAIA_API_TOKEN`, la web, la API, el servidor MCP y el WebSocket piden ese token (pantalla de ingreso en el navegador, `Authorization: Bearer` para agentes y scripts). Es un token compartido, sin usuarios ni permisos, y el compose de producción lo exige.

La pantalla de ingreso frena los intentos con un token equivocado: 10 seguidos y después uno cada 90 segundos (`429` mientras tanto). Cuenta por IP detrás de un proxy propio (`TAIA_TRUSTED_PROXIES`).

Sin el token, TAIA **no pide credenciales**. Los defaults están pensados para eso:

- Los servidores escuchan solo en `127.0.0.1`, tanto los puertos que publica Docker Compose como los procesos fuera de Docker (`TAIA_BIND_HOST` lo cambia).
- Lo que el servidor ejecuta y dónde escribe sale de su entorno, no de la API: binarios de los runtimes CLI (`TAIA_CLI_COMMAND_<PROVIDER>`), pasos de QA (`TAIA_QA_STEPS`), setup y rutas de worktrees (`WORKTREE_SETUP_CMD`, `WORKTREE_BASE_PATH`, `WORKTREE_REPO_PATH`).
- Los webhooks salientes solo se entregan a direcciones públicas y no siguen redirects (`TAIA_WEBHOOK_ALLOW_PRIVATE=1` permite receptores locales).
- Con `TAIA_SECRET_KEY`, los tokens, API keys y secretos de webhooks se guardan cifrados en la base (AES-256-GCM). La API enmascara los secretos al devolverlos.
- La imagen corre como el usuario `node` y se publica con SBOM y procedencia SLSA.

El modelo completo y los límites conocidos están en [SECURITY.md](.github/SECURITY.md).

[Sin publicar]: https://github.com/PabloAlaniz/taia/compare/v1.0.0-alpha.3...HEAD
[v1.0.0-alpha.3]: https://github.com/PabloAlaniz/taia/releases/tag/v1.0.0-alpha.3
