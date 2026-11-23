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

TAIA puede avisar a otros sistemas cuando pasan cosas en un workspace (tareas creadas, movidas, etc.). Los endpoints se configuran en el setting `webhooks.outgoing.<workspace>.endpoints`, un array JSON:

```json
[{ "id": "ci", "url": "https://example.com/hook", "secret": "…", "events": ["task:moved"], "active": true }]
```

- Sin `events` (o con `"*"`), se mandan todos.
- Cada entrega lleva los headers `x-taia-event` y `x-taia-workspace-id` y, si hay secreto, `x-taia-signature: sha256=<HMAC del body>`.
- Los fallos que pueden cambiar se reintentan hasta 3 veces: errores de red, timeouts, `408`, `425`, `429` y `5xx`. Otro `4xx` no se reintenta. Si el receptor manda `Retry-After`, se espera eso; si pide más de 10 segundos, la entrega pasa directo a *dead letter* con `nextRetryAt` indicando cuándo reenviarla. Las entregas que agotan los reintentos quedan como *dead letter*: `GET /api/webhooks/outgoing` las lista y `POST /api/webhooks/outgoing` con `delivery_id` las reenvía.

- `GET /api/webhooks/outgoing` y `GET /api/settings` no devuelven los secretos: los endpoints se listan con `hasSecret`.

:::note
Los webhooks solo se entregan a direcciones públicas y no siguen redirects. Para un receptor en el mismo host o en tu red local (por ejemplo n8n en `localhost`), definí `TAIA_WEBHOOK_ALLOW_PRIVATE=1` en el servidor. Ver [SECURITY](https://github.com/PabloAlaniz/taia/blob/main/.github/SECURITY.md).
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
