---
title: Webhooks e importación de GitHub
description: Recibir eventos de GitHub, avisar a otros sistemas y traer issues como tareas.
sidebar:
  order: 6
---

Las tres funciones se usan **por API**; no tienen pantalla propia.

## Webhooks entrantes

`POST /api/webhooks/incoming?workspace_id=<ws>` recibe eventos firmados, de GitHub o propios.

**Configuración:** el secreto de cada workspace se guarda en el setting `webhooks.incoming.<workspace>.secret`. Tiene que tener la forma `whsec_<base64>`, la de [Standard Webhooks](https://www.standardwebhooks.com/). Para generar uno:

```bash
echo "whsec_$(openssl rand -base64 32)"
curl -X PUT http://localhost:13333/api/settings -H 'content-type: application/json' \
  -d '{"settings": {"webhooks.incoming.ws-default.secret": "whsec_…"}}'
```

**Firma:**

| Origen | Cómo se firma |
|---|---|
| GitHub | Como firma GitHub: `x-hub-signature-256` sobre el cuerpo, con `x-github-event` y `x-github-delivery`. En GitHub, configurá como secreto el mismo texto completo, `whsec_…` incluido |
| Cualquier otro | [Standard Webhooks](https://www.standardwebhooks.com/): `webhook-id`, `webhook-timestamp` y `webhook-signature`. Las librerías oficiales de Standard Webhooks y [omniwebhook](https://github.com/PabloAlaniz/omniwebhook) firman así |

La verificación y la deduplicación las hace [omniwebhook](https://github.com/PabloAlaniz/omniwebhook):

- Se rechazan con `401` las firmas inválidas, ausentes o repetidas, y los timestamps de más de 5 minutos.
- Cada evento se procesa una sola vez por workspace. Una entrega repetida (mismo `webhook-id` o `x-github-delivery`) responde `200` con `duplicate: true`. Si llega mientras la primera todavía se está procesando, responde `409` y el emisor la reintenta.
- Si el procesamiento falla, el evento queda libre para que el reintento del emisor funcione.
- Sin secreto, o con uno que no tiene la forma `whsec_<base64>`, responde `428`.

Más de 120 entregas por minuto de un mismo cliente reciben `429` con `Retry-After`; se ajusta con `TAIA_WEBHOOK_RATE_LIMIT`. Sin `TAIA_TRUSTED_PROXIES`, todos los clientes comparten ese cupo.

Con `?dry_run=1` se verifica la firma y se calcula qué haría, pero no se mueve ninguna tarea ni se consume el evento.

**Qué hace con GitHub:** busca en el issue o PR una referencia a una tarea (`task:<id>`) y, según el evento, la mueve:

| Evento | Columna destino |
|---|---|
| Issue `closed` | `DONE` |
| Issue `reopened` | `IN_PROGRESS` |
| PR `opened`, `ready_for_review`, `synchronize`… | `REVIEW` |
| PR `closed` mergeado / no mergeado | `DONE` / `REJECTED` |

Esos slugs son los del preset Software Dev. Si el workspace no tiene esa columna, la transición queda registrada en la actividad pero no se aplica.

## Webhooks salientes

TAIA puede avisar a otros sistemas cuando pasan cosas en un workspace: tareas creadas, actualizadas, movidas, asignadas o borradas, y dependencias agregadas o quitadas. Los endpoints se configuran en el setting `webhooks.outgoing.<workspace>.endpoints`, un array JSON:

```json
[{ "id": "ci", "url": "https://example.com/hook", "secret": "whsec_…", "events": ["task:moved"], "active": true }]
```

- `secret` es obligatorio y tiene la forma `whsec_<base64>`. Para generar uno: `echo "whsec_$(openssl rand -base64 32)"`.
- Sin `events` (o con `"*"`), se mandan todos.
- Al guardar, TAIA rechaza con `400` un endpoint con una URL mal formada, con usuario y contraseña, o con un secreto inválido.

**Formato.** Cada entrega se firma con [Standard Webhooks](https://www.standardwebhooks.com/), con las cabeceras `webhook-id`, `webhook-timestamp` y `webhook-signature`. El cuerpo es:

```json
{ "type": "task:moved", "timestamp": "2026-11-23T15:04:05.000Z", "workspace_id": "ws-default", "actor": "web-ui", "data": { "task": { "…": "…" } } }
```

Para verificarla del lado receptor sirve cualquier librería de Standard Webhooks, o [omniwebhook](https://github.com/PabloAlaniz/omniwebhook), que además evita procesar dos veces la misma entrega:

```ts
import { createReceiver, PostgresIdempotencyStore, toIncomingRequest, toResponse } from 'omniwebhook'
import { standardScheme } from 'omniwebhook/standard'

const receive = createReceiver({
  verifier: standardScheme({ secrets: [process.env.TAIA_WEBHOOK_SECRET ?? ''] }),
  store: new PostgresIdempotencyStore(pool),
})

export async function POST(request: Request) {
  return toResponse(await receive.execute(await toIncomingRequest(request), procesar))
}
```

**Entrega y reintentos.**

- Emitir un evento solo lo encola en la tabla `webhook_outbox`: la acción que lo causó no espera al receptor.
- El servidor web entrega lo pendiente cada un par de segundos. Si hay varias réplicas, cada entrega la toma una sola.
- Se reintenta ante errores de red, timeouts (20 segundos por intento), `408`, `409`, `425`, `429` y `5xx`, hasta 10 intentos repartidos en unas 27 horas. Si el receptor manda `Retry-After`, se espera al menos eso.
- Otro `4xx` no se reintenta.
- `410 Gone` desactiva el endpoint (`active: false`).
- Cada intento queda registrado en `omniwebhook_attempts`. Las entregas y sus intentos se borran a los 30 días.
- Todos los intentos de una entrega llevan el mismo `webhook-id`, así que el receptor puede reconocer una repetida.

**Diagnóstico y reenvío.** `GET /api/webhooks/outgoing?workspace_id=<ws>` lista las últimas entregas con sus intentos. Las fallidas aparecen también en `deadLetters`. `POST /api/webhooks/outgoing` con `delivery_id` reenvía una fallida desde el primer intento, con el mismo `webhook-id`, hasta 2 veces.

`GET /api/webhooks/outgoing` y `GET /api/settings` no devuelven los secretos: los endpoints se listan con `hasSecret`.

:::note
Los webhooks solo se entregan a direcciones públicas y no siguen redirects. TAIA se conecta a la dirección que validó, así que un DNS que cambia de respuesta entre el chequeo y el envío no puede desviarlo.

Para un receptor en el mismo host o en tu red local (por ejemplo n8n), definí `TAIA_WEBHOOK_ALLOW_PRIVATE=1`: habilita loopback, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` y `fc00::/7`. Para algo más acotado, usá `TAIA_WEBHOOK_ALLOWED_NETWORKS` con una lista de redes, por ejemplo `192.168.1.0/24,100.64.0.0/10`. Las direcciones de metadatos de las nubes nunca se permiten. Ver [SECURITY](https://github.com/PabloAlaniz/taia/blob/main/.github/SECURITY.md).
:::

## Importar issues de GitHub

`POST /api/import/github` crea o actualiza tareas a partir de issues. **TAIA no consulta GitHub**: los issues los mandás vos, por ejemplo desde un script con `gh`:

```bash
gh issue list --repo acme/web --json number,title,body,state,labels,url > issues.json
curl -X POST http://localhost:13333/api/import/github -H 'content-type: application/json' \
  -d "{\"repository\": {\"owner\": \"acme\", \"name\": \"web\"}, \"issues\": $(cat issues.json), \"dryRun\": false}"
```

- `dryRun` es `true` por defecto: devuelve el plan (crear, actualizar o sin cambios) sin tocar nada.
- Volver a importar es idempotente: cada tarea queda marcada con un tag `github:<owner>/<repo>#<n>`.
- Las tareas nuevas caen en la columna inicial, salvo que mandes `default_status`.
- También acepta `workspace_id`, `project`, `project_id` y `default_priority`.
