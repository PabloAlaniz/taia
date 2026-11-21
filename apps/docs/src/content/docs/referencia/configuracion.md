---
title: Configuración
description: Variables de entorno y settings de TAIA.
sidebar:
  order: 1
---

TAIA se configura en dos lugares:

- **Variables de entorno** del servidor: conexión a la base, puertos, URLs y todo lo que define qué programas puede ejecutar el servidor.
- **Settings** guardados en la base, que se editan desde **Ajustes** o con `PUT /api/settings`: runtimes, zona horaria, worktrees, webhooks y alertas.

Cuando una opción existe en los dos lugares, el setting de la base gana sobre la variable de entorno, salvo que se indique lo contrario.

## Variables de entorno

### Base de datos

| Variable | Default | Notas |
|---|---|---|
| `DATABASE_URL` | — | Connection string. Si no está, se arma con las `POSTGRES_*` |
| `POSTGRES_HOST` | `localhost` | |
| `POSTGRES_PORT` | `5432` | En `docker compose`, también es el puerto del host |
| `POSTGRES_USER` / `POSTGRES_DB` | `taia` / `taia` | |
| `POSTGRES_PASSWORD` | `taia` | Obligatoria en producción (sin ella, el contenedor de Postgres no arranca) |
| `TAIA_MIGRATIONS_DIR` | `packages/core/migrations` | Solo si movés las migraciones |

En desarrollo local, los defaults ya apuntan al Postgres de `docker compose up -d postgres`.

### Puertos del host (docker compose)

| Variable | Default | Servicio |
|---|---|---|
| `APP_PORT` | `13333` | Web y API |
| `WS_PORT` | `13334` | WebSocket |
| `BROADCAST_PORT` | `13335` | Broadcast interno |
| `MCP_PORT` | `13336` | Servidor MCP (también el puerto del proceso MCP) |

Dentro de los contenedores, los puertos son siempre los mismos. Fuera de Docker, `APP_PORT`, `WS_PORT` y `BROADCAST_PORT` son los puertos en los que escuchan `pnpm dev` y `pnpm start`, y las URLs por defecto de abajo los siguen: con valores distintos podés correr dos instancias en la misma máquina.

### URLs

| Variable | Default | Notas |
|---|---|---|
| `TAIA_URL` | `http://localhost:13333` | URL de TAIA que reciben los agentes para llegar al tablero |
| `WS_CLIENT_URL` | `ws://localhost:13334` | URL del WebSocket que usa el navegador. En producción, `wss://<dominio>/ws`. El setting `app.ws_url` gana |
| `BROADCAST_URL` | `http://localhost:13335/broadcast` | Endpoint interno para avisar al WebSocket |
| `DOMAIN` | `localhost` | Dominio de Caddy (`deploy/docker-compose.prod.yml`) |
| `MCP_ALLOWED_HOSTS` | — | Hosts extra que acepta el servidor MCP, separados por comas (detrás de un proxy) |

### Red y secretos

| Variable | Default | Notas |
|---|---|---|
| `TAIA_BIND_HOST` | `127.0.0.1` (`0.0.0.0` en la imagen de Docker) | Interfaz en la que escuchan la app, el WebSocket, el broadcast y el MCP fuera de Docker |
| `MCP_HOST` | el de `TAIA_BIND_HOST` | Lo mismo, solo para el servidor MCP |
| `TAIA_API_TOKEN` | — | Token de acceso (16+ caracteres). Con él, la web, la API, el MCP y el WebSocket piden credenciales. La app y el MCP tienen que compartirlo. Ver [Deploy](/taia/guias/deploy/#token-de-acceso) |
| `TAIA_TRUSTED_PROXIES` | `0` (`1` en `deploy/docker-compose.prod.yml`) | Cuántos proxies propios hay delante de la app y agregan la IP del cliente a `X-Forwarded-For`, como Caddy. Con `0`, el freno de intentos fallidos de ingreso cuenta a todos los clientes juntos; con `1` o más, por IP |
| `TAIA_SECRET_KEY` | — | Clave (16+ caracteres) para cifrar en la base los tokens, API keys y secretos de webhooks. La app y el MCP tienen que compartirla. Ver [SECURITY](https://github.com/PabloAlaniz/taia/blob/main/.github/SECURITY.md#variables-de-entorno) |
| `TAIA_WEBHOOK_RATE_LIMIT` | `120/minute` | Cuántas entregas acepta `POST /api/webhooks/incoming` por cliente (por IP con `TAIA_TRUSTED_PROXIES`, si no todas juntas) antes de responder `429`. Formato `<cantidad>/<unidad>`, como `30/minute` o `1000/hour` |
| `TAIA_WEBHOOK_ALLOW_PRIVATE` | desactivado | Con `1`, los webhooks salientes pueden ir a `localhost` y a redes privadas |

### Comandos que ejecuta el servidor

| Variable | Default | Notas |
|---|---|---|
| `TAIA_CLI_COMMAND_CLAUDE_CODE`, `_AIDER`, `_CURSOR` | — | Binario de un runtime CLI. Sin esta variable, solo se acepta el binario propio (`claude`, `aider`, `cursor`/`cursor-agent`) |
| `TAIA_CLI_CWD` | — | Directorio de trabajo de los runtimes CLI. Gana sobre la UI |
| `TAIA_QA_STEPS` | `git status --short`, `git diff --check` | Pasos del [QA pipeline](/taia/guias/worktrees-y-qa/#qa-pipeline), como array JSON |
| `TAIA_QA_ARTIFACTS_DIR` | `.taia/qa-runs` | Logs y resultados del QA pipeline |
| `WORKTREE_SETUP_CMD` | — | Comando que se corre en cada worktree nuevo |
| `TAIA_ALLOW_REMOTE_COMMANDS` | desactivado | Con `1`, la API y la UI pueden fijar los pasos de QA, el setup de worktrees y las rutas de worktrees y clones. Solo en un host de confianza |

### Worktrees

| Variable | Default | Setting que la reemplaza |
|---|---|---|
| `WORKTREE_BASE_PATH` | `/tmp/taia-worktrees` | `worktree.base_path` (solo con `TAIA_ALLOW_REMOTE_COMMANDS=1`) |
| `WORKTREE_REPO_PATH` | `/tmp/taia-repos` | `worktree.repo_clone_path` (solo con `TAIA_ALLOW_REMOTE_COMMANDS=1`) |
| `WORKTREE_CLEANUP_HOURS` | `72` | `worktree.cleanup_hours` |
| `WORKTREE_AUTO_CLEANUP` | activado (salvo `false`) | `worktree.auto_cleanup` |
| `WORKTREE_AUTO_CREATE` | desactivado (salvo `true`) | `worktree.auto_create_on_assign` |

### Otras

| Variable | Default | Notas |
|---|---|---|
| `CRON_DEFAULT_TZ` | `UTC` | Zona horaria del cron si no hay setting `app.default_tz` |
| `TAIA_EXPOSE_DB_IDENTITY` | desactivado | Con `1`, `/api/runtime-target` muestra usuario, host y base sin hashear |
| `NEXT_TELEMETRY_DISABLED` | `1` en la imagen | Telemetría de Next.js |

### CLI y scripts de diagnóstico

| Variable | Default | Usada por |
|---|---|---|
| `TAIA_API` | `http://localhost:13333` | CLI `taia` |
| `TAIA_TOKEN` | — | CLI `taia`: el token de acceso de la instancia, si tiene |
| `TAIA_APP_URL`, `TAIA_MCP_URL` | `http://127.0.0.1:13333`, `http://127.0.0.1:13336/mcp` | `scripts/dev/check-*` |
| `TAIA_WORKSPACE_ID` | `ws-default` | `scripts/dev/check-*` |
| `TAIA_CHECK_TIMEOUT_SECONDS` | `5` | `scripts/dev/check-*` |

Las variables de los tests (`TEST_DATABASE_URL`, `OPENCLAW_GATEWAY_*`) están en [CONTRIBUTING](https://github.com/PabloAlaniz/taia/blob/main/.github/CONTRIBUTING.md).

## Settings

| Clave | Para qué | Dónde se edita |
|---|---|---|
| `runtime.providers.<provider>.*`, `runtime.default_provider` | Configuración de los runtimes. Se aplica a la instancia del mismo nombre | Ajustes › Runtime |
| `runtime.instances.<id>.*` | Secretos y estado de cada instancia (token, API key, identidad del dispositivo) | La escribe TAIA |
| `app.ws_url` | URL del WebSocket para el navegador | Ajustes › General |
| `app.default_tz` | Zona horaria por defecto | Ajustes › General |
| `worktree.*` | Rutas y comportamiento de los worktrees | Ajustes › Worktrees |
| `webhooks.incoming.<ws>.secret` | Secreto de los webhooks entrantes | API |
| `webhooks.outgoing.<ws>.endpoints` | Endpoints de los webhooks salientes (JSON) | API |
| `telegram_target`, `alerts.channel` | Destinatario y canal de las alertas, enviadas por el runtime (capacidad `messaging`) | API |

Las claves sensibles (tokens, API keys, identidades) vuelven enmascaradas al leerlas. En la base se guardan cifradas solo si definís `TAIA_SECRET_KEY`; sin ella quedan en texto plano.
