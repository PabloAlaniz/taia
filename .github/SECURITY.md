# Política de seguridad

## Versiones soportadas

TAIA está en alpha. Solo la última versión publicada recibe correcciones de seguridad.

| Versión | Soportada |
|---------|-----------|
| La última release | Sí |
| Anteriores | No |

## Reportar una vulnerabilidad

Si descubrís una vulnerabilidad de seguridad, por favor reportala de forma responsable:

1. **NO** crear un issue público en GitHub
2. Reportarla en privado desde [GitHub Security Advisories](https://github.com/PabloAlaniz/taia/security/advisories/new)
3. Incluir los pasos para reproducir la vulnerabilidad
4. Confirmaremos la recepción dentro de las 48 horas y proporcionaremos un cronograma para la corrección

## Modelo de seguridad actual

**Por defecto TAIA no pide credenciales.** Así está pensado para correr en tu máquina o en una red privada. Quien llegue a sus puertos puede:

- leer y editar tareas, agentes y configuración;
- usar las herramientas del servidor MCP;
- configurar runtimes, apuntar el servidor a la URL de un gateway y lanzar sesiones de agentes.

**Con `TAIA_API_TOKEN` en el entorno del servidor, todo eso pide el token:** la web (pantalla de ingreso y cookie de sesión), la API y el servidor MCP (`Authorization: Bearer` o `X-API-Key`), y el WebSocket (un ticket derivado del token). `deploy/docker-compose.prod.yml` no arranca sin él. Ver [token de acceso](https://pabloalaniz.github.io/taia/guias/deploy/#token-de-acceso).

Es un token compartido, no un sistema de usuarios:

- Quien lo tiene, tiene acceso completo. No hay roles, permisos ni registro de quién hizo qué.
- Viaja en cada request: usalo solo sobre TLS.
- La cookie del navegador y el ticket del WebSocket se derivan del token y no sirven como token. Cambiar la variable y reiniciar invalida las sesiones.
- La pantalla de ingreso frena los tokens equivocados (10 seguidos, después uno cada 90 segundos, con `429`), contando en la base, así que un reinicio no da intentos nuevos. El freno no cubre los pedidos con `Authorization: Bearer`: usá igual un token largo y aleatorio (`openssl rand -hex 32`); el servidor rechaza los de menos de 16 caracteres.
- Quedan abiertos `GET /api/health` (sonda de vida) y `POST /api/webhooks/incoming` (valida la firma de cada workspace y limita las entregas por cliente, `TAIA_WEBHOOK_RATE_LIMIT`).

Lo que viene cerrado por default, con o sin token:

- `docker-compose.yml` publica todos los puertos solo en `127.0.0.1`. `deploy/docker-compose.prod.yml` expone únicamente Caddy (80/443).
- Los runtimes CLI solo ejecutan su propio binario. Cualquier otro necesita `TAIA_CLI_COMMAND_<PROVIDER>` en el entorno del servidor, así que la API no puede cambiar el programa que se lanza.
- Los comandos de shell que corre el servidor (pasos del QA pipeline y comando de setup de worktrees) salen del entorno (`TAIA_QA_STEPS`, `WORKTREE_SETUP_CMD`). La API y la UI solo pueden fijarlos con `TAIA_ALLOW_REMOTE_COMMANDS=1`, pensado para un host de confianza de un solo usuario.
- Fuera de Docker (`pnpm dev`, `pnpm start`, `pnpm mcp`), la app, el WebSocket, el broadcast interno y el servidor MCP escuchan solo en `127.0.0.1`. `TAIA_BIND_HOST` (o `MCP_HOST` para el MCP) lo cambia; la imagen de Docker lo pone en `0.0.0.0` porque los puertos los publica compose.
- Las rutas donde el servidor clona repos y crea worktrees salen del entorno (`WORKTREE_BASE_PATH`, `WORKTREE_REPO_PATH`). Igual que los comandos, la API y la UI solo pueden cambiarlas con `TAIA_ALLOW_REMOTE_COMMANDS=1`.
- Los webhooks salientes solo se entregan a direcciones públicas: se rechazan loopback, redes privadas, link-local (incluido el endpoint de metadata de las nubes) y los redirects. `TAIA_WEBHOOK_ALLOW_PRIVATE=1` permite receptores en el mismo host o en la red local.
- La API no devuelve los secretos de webhooks (ni el de los entrantes ni los de firma de los salientes).
- El WebSocket no reenvía mensajes entre clientes.
- `/api/runtime-target` no revela usuario, host ni nombre de la base.

Límites conocidos:

- No hay usuarios ni permisos: el token de acceso es todo o nada.
- La URL de un runtime (por ejemplo un gateway) no se filtra: lo normal es que esté en `localhost` o en la red local. Quien pueda configurar un runtime puede hacer que el servidor se conecte a una dirección interna.
- El filtro de webhooks resuelve el nombre antes de enviar; un DNS que responda distinto entre el chequeo y el envío puede esquivarlo. Si eso te importa, sumá una política de red en el host.
- Sin `TAIA_SECRET_KEY`, los secretos se guardan sin cifrar en la base (ver abajo).
- `GET /api/settings?reveal=<clave>` devuelve el valor de un secreto a quien tenga acceso a la API (cualquiera, si no hay token).

Para sumar basic auth delante, ver [Deploy](https://pabloalaniz.github.io/taia/guias/deploy/#proteger-con-basic-auth).

## Prácticas de seguridad

- No se hardcodean secretos en el repositorio
- Las credenciales de base de datos se configuran mediante variables de entorno
- Los tokens y API keys de los runtimes nunca se commitean ni se pasan por variables de entorno (ver abajo)
- Las rutas de API validan la entrada con esquemas Zod
- No se usa `eval()`. Los únicos procesos que lanza el servidor son los runtimes CLI (con la política de comandos de arriba), `git` para worktrees y los comandos de QA que configura el operador
- El estado vive en PostgreSQL. Escriben a disco solo los worktrees, los clones de repos y los artefactos de QA

## Cadena de suministro

- Las GitHub Actions están fijadas por SHA y Dependabot las actualiza junto con las dependencias de npm y la imagen base.
- CI falla ante un aviso de severidad alta o crítica (`pnpm audit`), ante un secreto en los commits de un PR o push (gitleaks) y, con el repo público, ante una dependencia nueva con vulnerabilidades altas (dependency review) o un hallazgo de CodeQL.
- Las imágenes de `ghcr.io/pabloalaniz/taia` llevan SBOM y procedencia SLSA, generados por el mismo workflow que las publica.

Avisos de `pnpm audit` ignorados a propósito (`pnpm.auditConfig.ignoreGhsas` en `package.json`):

| Aviso | Paquete | Por qué |
|---|---|---|
| [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) | `picomatch` | ReDoS con patrones glob hostiles. No hay versión corregida. Llega por herramientas de build y test y por `next-intl`/`astro`; TAIA no le pasa patrones que vengan de un usuario. Se quita de la lista cuando salga el parche. |

## Variables de entorno

Las siguientes variables de entorno contienen datos sensibles y nunca deben ser commiteadas:

- `DATABASE_URL` — Cadena de conexión a PostgreSQL
- `POSTGRES_PASSWORD` — Contraseña de la base de datos

- `TAIA_API_TOKEN` — Token de acceso a la instancia
- `TAIA_SECRET_KEY` — Clave con la que se cifran los secretos guardados en la base

Los secretos de cada instancia de runtime (token de un gateway, API key de Anthropic, identidad del dispositivo emparejado) se cargan desde `/settings/runtime` y se guardan en la tabla `settings`, bajo `runtime.instances.<id>.*`. Los secretos de webhooks van a la misma tabla.

**Cifrado en la base.** Con `TAIA_SECRET_KEY` en el entorno del servidor (al menos 16 caracteres; `openssl rand -base64 32`), esos valores se guardan cifrados con AES-256-GCM, y lo que ya estaba en texto plano se cifra en el próximo arranque. Un dump o un acceso de solo lectura a PostgreSQL muestra entonces solo texto cifrado. A tener en cuenta:

- La app y el servidor MCP tienen que usar la misma clave.
- Si perdés la clave, los secretos guardados no se recuperan: hay que cargarlos de nuevo.
- Sin la variable, los secretos se guardan **sin cifrar**, como antes: la API los enmascara, pero quien lea la base los ve. Protegé el acceso a PostgreSQL como protegerías esos secretos.

Usar `.env.local` (en gitignore) para desarrollo local. En producción, usar el sistema de gestión de secretos de tu plataforma (Docker secrets, Kubernetes secrets, etc.).
