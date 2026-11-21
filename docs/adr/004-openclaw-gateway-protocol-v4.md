# ADR-004: OpenClaw Gateway — protocolo v4 con el cliente oficial

**Estado**: Aceptado
**Fecha**: 2026-10-26
**Reemplaza**: la integración anterior por HTTP (`/tools/invoke`), retirada

## Contexto

El cliente de OpenClaw de TAIA implementaba a mano el protocolo de gateway **v3** (handshake `connect.challenge`, RPCs `sessions.history`, `gateway.health`, `cron`) con fallback a HTTP `POST /tools/invoke` para `sessions_spawn`, `sessions_send`, `cron`, `gateway` y `config_patch`, más `GET /api/cron/list` y `POST /api/message`.

Contra OpenClaw 2026.10.7 (verificado en Docker):

- El gateway solo acepta clientes operador en **protocolo v4**; las conexiones v3 se rechazan.
- Las conexiones que no vienen de loopback (Docker, LAN, tailnet) necesitan una **identidad de dispositivo Ed25519** firmando el nonce del challenge; un dispositivo nuevo queda pendiente hasta que un operador aprueba el **pairing**.
- Los tools HTTP `sessions_spawn`, `cron` y `gateway` devuelven `Tool not available`; `/api/message` y `/api/cron/list` devuelven 404. `/tools/invoke` sigue existiendo para tools de lectura (`agents_list`, `sessions_list`).
- El config agrupa los agentes en `agents.entries` (mapa por id) en lugar de `agents.list`.

Resultado: TAIA no podía conectarse por WS y la mayoría de los fallbacks HTTP fallaban en silencio.

## Decisión

1. **Usar el cliente oficial** `@openclaw/gateway-client` (y `@openclaw/gateway-protocol`) con versión exacta, en lugar de mantener el protocolo a mano. Resuelve handshake, firma, tokens de dispositivo, reconexión y watchdog de ticks. Requiere Node ≥ 22.19.
2. **Solo protocolo v4**, sin fallbacks HTTP. Todas las operaciones van por RPC:

   | Operación | RPC |
   |---|---|
   | Agentes | `agents.list` |
   | Sesiones | `sessions.list`, `sessions.create` (spawn), `chat.send` (follow-up), `agent.wait` (esperar run) |
   | Transcript | `chat.history` |
   | Cron | `cron.list/status/add/update/remove/run/runs`, `wake` |
   | Config | `config.get`, `config.patch` |
   | Salud | `health` (+ snapshot de `hello-ok`) |
   | Mensajería | `send` |

   Las operaciones con efectos llevan `idempotencyKey`.
3. **Identidad de dispositivo propia de TAIA** (`deviceId = sha256(clave pública cruda)`), persistida por un `OpenClawCredentialStore` **inyectado**: el adapter no toca la base. Core la guarda en settings (`runtime.providers.openclaw.device_identity` y `.device_token.<rol>`), que la API de settings nunca revela. Así el pairing se aprueba una sola vez.
4. **Pairing como estado visible**: `testConnection()` devuelve `reason: 'pairing_required'` con el `requestId`, y la UI muestra `openclaw devices approve <requestId>`.
5. **Traducciones en el adapter**, no en core:
   - `agents.entries` ↔ `RuntimeConfig.agents.list` (puente hasta una config neutral de runtime).
   - `cron add/update` de TAIA → esquema de jobs v4 (`sessionTarget: 'isolated'`, `payload.kind: 'agentTurn'`), equivalente a los heartbeats de TAIA que abren una sesión por corrida.
   - Los jobs que declara el propio gateway (`declarationKey`, como su heartbeat interno) se exponen como `managedByRuntime` y TAIA no los edita.

## Consecuencias

- Los gateways solo-v3 dejan de estar soportados (igual ya no funcionaban por WS).
- Primera conexión desde una instalación nueva: hay que aprobar el dispositivo en OpenClaw.
- Next.js trata `@openclaw/gateway-client` como paquete externo del server (resuelve `ws` con `require` dinámico).
- Los tests unitarios cubren el cliente con un transport falso; la suite de integración (`packages/core/__tests__/integration/openclaw-adapter`) corre contra un gateway real con una identidad de test que se aprueba una vez (ver CONTRIBUTING).

## Hallazgos de la verificación

- `HEARTBEAT.md` ya no forma parte de los archivos de workspace (`agents.files.list` lista `SOUL.md`, `AGENTS.md`, `USER.md`, `BOOTSTRAP.md`, `MEMORY.md`); el heartbeat es un job de cron del gateway. Relevante para la proyección de contexto (ADR-005).
- `agents.files.get/set` con `expectedHash` permite que TAIA **empuje** los archivos de contexto en lugar de que el agente los descargue por HTTP.
