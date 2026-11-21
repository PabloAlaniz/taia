---
title: OpenClaw
description: Delegar la ejecución en un gateway de OpenClaw.
sidebar:
  order: 1
---

**Tipo:** gateway · **Provider:** `openclaw` · **Adapter:** `packages/runtime/src/adapters/openclaw/`

[OpenClaw](https://github.com/openclaw/openclaw) corre los agentes en su propio proceso, el gateway, que puede estar en otra máquina. TAIA se conecta por WebSocket con el protocolo v4 y el cliente oficial `@openclaw/gateway-client` ([ADR-004](/taia/arquitectura/adr/004-openclaw-gateway-protocol-v4/)). Es el runtime más completo: declara las 11 capacidades.

## Configurar

1. Levantá un gateway de OpenClaw (ver su repo).
2. En **Ajustes › Runtime**, elegí **OpenClaw (gateway)** y completá:
   - **URL del gateway:** por ejemplo, `http://localhost:18789`.
   - **Token:** el `gateway.auth.token` de `openclaw.json`.
3. **Probar conexión.** La primera vez, el gateway pide aprobar el dispositivo de TAIA: `openclaw devices approve <requestId>`, o desde la Control UI. Volvé a probar. La identidad aprobada queda guardada y sobrevive a los reinicios.
4. **Guardar y activar.**

:::note[TAIA en Docker y el gateway en el host]
Dentro del contenedor, TAIA reescribe `localhost` a `host.docker.internal`, y `docker-compose.yml` mapea ese nombre al host también en Linux. Poné la URL tal como la usarías desde el host.
:::

## Configuración

| Campo | Notas |
|---|---|
| URL | URL del gateway |
| Token | Secreto, enmascarado por la API |
| Sync de contexto | `push` (default): TAIA escribe los archivos de contexto en el workspace del agente. `pull`: el agente los pide a TAIA ([ADR-005](/taia/arquitectura/adr/005-runtime-owned-context-and-settings/)) |

La identidad del dispositivo y los device tokens los emite el gateway al emparejar; se guardan en `settings` y no se editan a mano.

## Qué habilita

Sesiones y transcripciones en vivo, heartbeats con [cron](/taia/guias/cron-y-heartbeats/), [aprobaciones](/taia/guias/aprobaciones-y-costos/), alertas por los canales del gateway (por ejemplo, Telegram), lectura de modelo y tools por agente, alta de agentes en el gateway y acceso a su configuración.

El contexto del agente se proyecta como archivos del workspace (`SOUL.md`, `IDENTITY.md`, `AGENTS.md`, `USER.md`). Ver [Modelo de contexto](/taia/arquitectura/modelo-de-contexto/).

## Limitaciones

- Cada gateway necesita un emparejamiento aprobado.
- La config cruda (`openclaw.json`) se expone como vía de escape. TAIA usa los settings en forma neutral (modelo, tools) y no edita ese archivo directamente.

## Tests de integración

Hay una suite contra un gateway real. Ver [CONTRIBUTING](https://github.com/PabloAlaniz/taia/blob/main/.github/CONTRIBUTING.md).
