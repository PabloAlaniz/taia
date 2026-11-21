# Registro de cambios

Todos los cambios notables de TAIA se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y este proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

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

La pantalla de ingreso frena los intentos con un token equivocado: 10 seguidos y después uno cada 90 segundos (`429` mientras tanto). Cuenta por IP detrás de un proxy propio (`TAIA_TRUSTED_PROXIES`), guarda la cuenta en Postgres (sobrevive a un reinicio) y nunca verifica más tokens a la vez que los que quedan en el cupo.

`POST /api/webhooks/incoming`, abierto sin token, admite 120 entregas por minuto por cliente (`TAIA_WEBHOOK_RATE_LIMIT`) y responde `429` antes de leer el cuerpo o tocar la base.

Sin el token, TAIA **no pide credenciales**. Los defaults están pensados para eso:

- Los servidores escuchan solo en `127.0.0.1`, tanto los puertos que publica Docker Compose como los procesos fuera de Docker (`TAIA_BIND_HOST` lo cambia).
- Lo que el servidor ejecuta y dónde escribe sale de su entorno, no de la API: binarios de los runtimes CLI (`TAIA_CLI_COMMAND_<PROVIDER>`), pasos de QA (`TAIA_QA_STEPS`), setup y rutas de worktrees (`WORKTREE_SETUP_CMD`, `WORKTREE_BASE_PATH`, `WORKTREE_REPO_PATH`).
- Los webhooks salientes solo se entregan a direcciones públicas y no siguen redirects (`TAIA_WEBHOOK_ALLOW_PRIVATE=1` permite receptores locales).
- Con `TAIA_SECRET_KEY`, los tokens, API keys y secretos de webhooks se guardan cifrados en la base (AES-256-GCM). La API enmascara los secretos al devolverlos.
- La imagen corre como el usuario `node` y se publica con SBOM y procedencia SLSA.

El modelo completo y los límites conocidos están en [SECURITY.md](.github/SECURITY.md).

[Sin publicar]: https://github.com/PabloAlaniz/taia/compare/v1.0.0-alpha.3...HEAD
[v1.0.0-alpha.3]: https://github.com/PabloAlaniz/taia/releases/tag/v1.0.0-alpha.3
