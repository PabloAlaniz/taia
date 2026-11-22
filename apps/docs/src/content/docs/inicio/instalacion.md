---
title: Instalación
description: Levantar TAIA en tu máquina con Docker Compose.
---

## Requisitos

- Docker con Docker Compose v2.24 o superior.
- Unos 2 GB de RAM libres para el build.

## Levantarlo

```bash
git clone https://github.com/PabloAlaniz/taia.git
cd taia
docker compose up -d --build
```

Abrí <http://localhost:13333>. El primer arranque crea la base y aplica las migraciones.

El asistente inicial (**Configurar TAIA**) te pide tres cosas:

1. **Un runtime**, el que va a ejecutar tus agentes. Podés elegir **Omitir conexión** y usar TAIA sin runtime ([modo standalone](/taia/inicio/elegir-setup/#sin-runtime-standalone)).
2. **Tu primer proyecto** (opcional): para quién o sobre qué trabajás, por ejemplo un cliente o un producto, con un repositorio si tiene. Le da contexto a los agentes en cualquier workspace.
3. **Tu primer workspace**: cómo trabajás, a partir de un preset de columnas (Software Dev, Marketing, Escritura, Ventas o Personalizado).

Ver [Workspaces, columnas y proyectos](/taia/conceptos/workspaces-y-columnas/).

:::caution
Por defecto TAIA no pide credenciales. `docker-compose.yml` publica todos los puertos solo en `127.0.0.1`, así que nadie más en la red puede entrar. Si querés usarlo desde otra máquina, definí un [token de acceso](/taia/guias/deploy/#token-de-acceso) y seguí [Deploy](/taia/guias/deploy/).
:::

## Qué queda corriendo

| Servicio | Puerto | Para qué |
|---|---|---|
| Web (Next.js) | 13333 | Tablero y API REST |
| WebSocket | 13334 | Actualizaciones en vivo |
| Broadcast | 13335 | Interno: el servidor avisa al WebSocket |
| Servidor MCP (HTTP) | 13336 | Para tus agentes: `http://localhost:13336/mcp` |
| PostgreSQL | 5432 | Base de datos |

## Cambiar puertos o correr dos stacks

Los puertos del host se cambian con variables de entorno. Para un segundo stack desde el mismo checkout, usá otro nombre de proyecto (`-p`):

```bash
APP_PORT=14333 WS_PORT=14334 BROADCAST_PORT=14335 MCP_PORT=14336 POSTGRES_PORT=5433 \
  docker compose -p taia2 up -d --build
```

Dentro de los contenedores los puertos son siempre los mismos.

## Próximos pasos

- [Elegí tu setup](/taia/inicio/elegir-setup/): con qué runtime conviene arrancar.
- [Conectar un cliente MCP](/taia/guias/cliente-mcp/): que tus agentes usen el tablero.
- Para desarrollar sobre TAIA (sin Docker para la app), ver [CONTRIBUTING](https://github.com/PabloAlaniz/taia/blob/main/.github/CONTRIBUTING.md).
