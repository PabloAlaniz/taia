---
title: Conectar un cliente MCP
description: Que Claude Code, Claude Desktop, Cursor u otro cliente MCP use el tablero.
sidebar:
  order: 1
---

TAIA expone un servidor [MCP](https://modelcontextprotocol.io/) con [36 herramientas](/taia/referencia/herramientas-mcp/): tareas, subtareas, dependencias, mensajes, proyectos, workspaces, worktrees, sesiones y agentes.

Hay dos transportes:

| Transporte | Cómo se levanta | Cuándo usarlo |
|---|---|---|
| **HTTP** | Viene con `docker compose up` en `http://localhost:13336/mcp`. Fuera de Docker: `pnpm -F @taia/mcp start:http` | Lo normal: un solo servidor compartido por todos los clientes |
| **stdio** | `pnpm mcp` desde el repo | Clientes que solo hablan stdio y corren en la misma máquina que el código de TAIA |

## Claude Code

En cualquier proyecto:

```bash
claude mcp add --transport http taia http://localhost:13336/mcp
```

Dentro del repo de TAIA no hace falta: el `.mcp.json` de la raíz ya lo declara. Al abrir el proyecto, Claude Code pide aprobar el server `taia`, y `/mcp` lo muestra conectado.

## Claude Desktop

Claude Desktop lee su propio archivo de configuración. Con el stack de Docker arriba:

```bash
./scripts/dev/connect-claude-desktop.sh
```

El script agrega una entrada `taia` (con backup del archivo) que conecta por [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) al servidor HTTP. Después cerrá Claude Desktop del todo y volvé a abrirlo.

Para hacerlo a mano, agregá esto a `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "taia": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:13336/mcp"]
    }
  }
}
```

Si Claude Desktop no encuentra `npx`, el script resuelve el problema usando tu shell de login.

## Cursor y otros clientes

Cualquier cliente con soporte para MCP por HTTP (streamable HTTP) usa la URL `http://localhost:13336/mcp`. Si el cliente solo soporta stdio, usá `mcp-remote` como en el ejemplo de Claude Desktop.

## Workspaces

Las herramientas que listan o crean cosas aceptan `workspace_id`; sin él, usan `ws-default`. Si tus agentes trabajan en otro workspace, indicalo en sus instrucciones. Para ver los workspaces y sus columnas: `taia_list_workspaces` y `taia_get_workspace_columns`.

## Acceso desde otra máquina o detrás de un proxy

Sin `TAIA_API_TOKEN`, el servidor MCP no pide credenciales: en Docker solo escucha en `127.0.0.1`, y en producción no se publica. Con el [token de acceso](/taia/guias/deploy/#token-de-acceso) definido, cada cliente lo manda como `Authorization: Bearer <token>`; en Claude Code:

```bash
claude mcp add --transport http taia http://localhost:13336/mcp \
  --header "Authorization: Bearer <token>"
```

Además, el servidor rechaza requests con un `Host` que no reconoce (protección contra DNS rebinding). Agregá el nombre público con `MCP_ALLOWED_HOSTS`, separado por comas.
