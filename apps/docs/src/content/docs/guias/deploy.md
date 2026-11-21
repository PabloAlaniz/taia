---
title: Deploy y self-hosting
description: Poner TAIA en un servidor con Docker Compose, Caddy y TLS.
sidebar:
  order: 9
---

:::danger[Antes de exponerlo]
Sin token, cualquiera con la URL puede ver y editar el tablero. `deploy/docker-compose.prod.yml` exige un [token de acceso](#token-de-acceso); podés sumar [basic auth](#proteger-con-basic-auth), una VPN o restricciones de IP. El modelo completo está en [SECURITY](https://github.com/PabloAlaniz/taia/blob/main/.github/SECURITY.md).
:::

## Cómo queda armado

El stack de producción (`docker-compose.yml` + `deploy/docker-compose.prod.yml`) expone **solo Caddy** (80/443), con TLS automático. Caddy manda `/ws` al WebSocket y el resto a la app. El servidor MCP, el broadcast y Postgres quedan dentro de la red de compose.

El estado vive en PostgreSQL y las migraciones corren solas al arrancar. Requiere Docker Compose v2.24 o superior.

## Con dominio (recomendado)

Funciona igual en un VPS, en una VM de cualquier nube o en una Raspberry Pi.

```bash
git clone https://github.com/PabloAlaniz/taia.git && cd taia
cp deploy/.env.production.example .env
# en .env: DOMAIN=taia.tudominio.com y POSTGRES_PASSWORD=$(openssl rand -base64 24)
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```

Apuntá el DNS de tu dominio (registro A) a la IP del servidor. Caddy pide el certificado a Let's Encrypt y TAIA queda en `https://taia.tudominio.com`.

Si `POSTGRES_PASSWORD` está vacío, el contenedor de Postgres no arranca.

## Sin dominio (IP o red local)

En `.env`:

```bash
DOMAIN=:80
WS_CLIENT_URL=ws://TU_IP/ws   # el navegador abre el WebSocket con esta URL
POSTGRES_PASSWORD=...
```

Sin TLS no hay `wss://`. Por eso `WS_CLIENT_URL` tiene que usar `ws://` y la IP real, no `localhost`; si no, el tablero no se actualiza en vivo.

## En Google Cloud (Compute Engine)

```bash
gcloud compute instances create taia --machine-type=e2-small \
  --image-family=debian-12 --image-project=debian-cloud --tags=http-server,https-server
gcloud compute firewall-rules create allow-web --allow=tcp:80,tcp:443 \
  --target-tags=http-server,https-server
gcloud compute ssh taia
curl -fsSL https://get.docker.com | sh
# y después, los mismos pasos de "Con dominio"
```

## PaaS (Railway, Render…)

Construyen desde el `Dockerfile` o usan la imagen de GHCR, y manejan TLS y dominio. La limitación es que exponen un solo puerto, y el navegador necesita llegar al WebSocket (13334). Configurá `WS_CLIENT_URL` con una URL pública del WebSocket, o cargala en **Ajustes › General**. Si eso no es posible, el setup con Caddy es más simple.

## PostgreSQL gestionado (Neon, Supabase, Cloud SQL)

1. En `.env`, poné `DATABASE_URL` con tu connection string (por ejemplo, `postgresql://user:pass@host:5432/taia?sslmode=require`).
2. Agregá el override que saca el contenedor de Postgres:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
  -f deploy/docker-compose.external-db.yml up -d --build
```

La app y el servidor MCP usan esa base, y las migraciones se aplican al arrancar. La base tiene que estar vacía la primera vez; ver [Actualizar](/taia/guias/actualizar/).

## Imagen de GHCR

Cada push a `main` publica `ghcr.io/pabloalaniz/taia:main` y cada release, `ghcr.io/pabloalaniz/taia:<versión>`. Para una prueba rápida contra una base existente:

```bash
docker run -p 127.0.0.1:13333:13333 -p 127.0.0.1:13334:13334 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/taia \
  ghcr.io/pabloalaniz/taia:main
```

La imagen trae la app y el WebSocket. El servidor MCP se corre como otro contenedor de la misma imagen con `pnpm -F @taia/mcp start:http` (así lo hace `docker-compose.yml`).

## Token de acceso

Con `TAIA_API_TOKEN` en el entorno del servidor, TAIA pide ese token para todo: la web, la API, el servidor MCP y el WebSocket.

```bash
openssl rand -hex 32   # generá uno y guardalo en .env como TAIA_API_TOKEN
```

- **Navegador:** la primera vez muestra una pantalla de ingreso donde pegás el token; la sesión dura 30 días.
- **Agentes, CLI y scripts:** mandan `Authorization: Bearer <token>` (o `X-API-Key: <token>`). El CLI lo toma de `TAIA_TOKEN`, y la extensión de VS Code del ajuste `taia.apiKey`.
- **Clientes MCP:** el mismo header; ver [Conectar un cliente MCP](/taia/guias/cliente-mcp/).

No hay usuarios ni permisos: quien tiene el token tiene acceso completo. Para cambiarlo, modificá la variable y reiniciá; las sesiones abiertas dejan de valer. Usalo siempre sobre TLS (el compose de producción ya pone Caddy delante), porque el token viaja en cada request.

`docker-compose.yml` lo deja opcional, pensado para tu máquina. `deploy/docker-compose.prod.yml` no arranca sin él.

La pantalla de ingreso frena los intentos con un token equivocado: admite 10 seguidos y después devuelve uno cada 90 segundos. Mientras tanto responde `429`, también al token correcto. Sólo cuentan los intentos fallidos. El freno cubre la pantalla de ingreso, no los pedidos con `Authorization: Bearer`, así que la protección real sigue siendo un token largo y al azar. Con el compose de producción cuenta por IP (`TAIA_TRUSTED_PROXIES=1`, por Caddy); sin un proxy propio delante, cuenta a todos los clientes juntos. Ver [configuración](/taia/referencia/configuracion/).

## Proteger con basic auth

Es una capa extra delante del token, útil si no querés que la pantalla de ingreso sea visible desde Internet.

Generá el hash:

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'tu-password'
```

y agregalo a `deploy/Caddyfile`, dentro del bloque del sitio:

```text
basicauth {
	admin <HASH_GENERADO>
}
```

Otras opciones: restringir por IP en el firewall, o dejarlo en una red privada o VPN.

## Verificar

```bash
# en los logs tiene que aparecer "Migrations complete"
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml logs app | grep -i migration
# la URL del WebSocket que recibe el navegador (no debería ser localhost)
curl https://TU_DOMINIO/api/config/client
```

La prueba final: abrí el tablero en dos pestañas, mové una tarea en una y fijate que la otra se actualice sola. Si no, revisá `WS_CLIENT_URL` ([Solución de problemas](/taia/problemas/#el-tablero-no-se-actualiza-en-vivo)).
