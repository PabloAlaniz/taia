---
title: Webhooks e importación de GitHub
description: Recibir eventos de GitHub, avisar a otros sistemas y traer issues como tareas.
sidebar:
  order: 6
---

Las tres funciones se usan **por API**; no tienen pantalla propia.

## Webhooks entrantes

`POST /api/webhooks/incoming?workspace_id=<ws>` recibe eventos firmados, de GitHub o propios.

**Configuración:** el secreto de cada workspace se guarda en el setting `webhooks.incoming.<workspace>.secret`:

```bash
curl -X PUT http://localhost:13333/api/settings -H 'content-type: application/json' \
  -d '{"settings": {"webhooks.incoming.ws-default.secret": "<secreto>"}}'
```

**Firma:**

| Origen | Headers |
|---|---|
| GitHub | `x-hub-signature-256`, `x-github-event` y `x-github-delivery` (GitHub los manda solos si configurás el mismo secreto) |
| Propio | `x-taia-webhook-signature` = `sha256=` + HMAC-SHA256 de `"<timestamp>.<body>"`, `x-taia-webhook-timestamp` (segundos Unix) y `x-taia-webhook-id` |

Se rechazan las firmas inválidas, los timestamps de más de 5 minutos y las entregas repetidas (mismo id). Más de 120 entregas por minuto de un mismo cliente reciben `429` con `Retry-After`; se ajusta con `TAIA_WEBHOOK_RATE_LIMIT`. Sin `TAIA_TRUSTED_PROXIES`, todos los clientes comparten ese cupo.

**Qué hace con GitHub:** busca en el issue o PR una referencia a una tarea (`task:<id>`) y, según el evento, la mueve:

| Evento | Columna destino |
|---|---|
| Issue `closed` | `DONE` |
| Issue `reopened` | `IN_PROGRESS` |
| PR `opened`, `ready_for_review`, `synchronize`… | `REVIEW` |
| PR `closed` mergeado / no mergeado | `DONE` / `REJECTED` |

Esos slugs son los del preset Software Dev. Si el workspace no tiene esa columna, la transición queda registrada en la actividad pero no se aplica. Con `?dry_run=1` solo se registra.

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
