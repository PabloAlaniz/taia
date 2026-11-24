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

Sin `TAIA_API_TOKEN`, el servidor MCP no pide credenciales: en Docker solo escucha en `127.0.0.1`, y en producción no se publica. Con el [token de acceso](/taia/guias/deploy/#token-de-acceso) definido, cada cliente tiene que mandar un token como `Authorization: Bearer <token>` (o `X-API-Key: <token>`).

### Un token por agente

En vez de repartir `TAIA_API_TOKEN`, creá un token para cada agente o cliente en **Configuración → Acceso**:

- **Agente:** usa el MCP y la API, pero no puede gestionar tokens ni ver o cambiar las credenciales guardadas en los ajustes. Es el que corresponde a un agente.
- **Admin:** acceso completo, incluida la gestión de tokens.

El token (`taia_<id>_<secreto>`) se muestra una sola vez, junto con los comandos listos para copiar. TAIA guarda solo un hash. Cada token puede vencer a los 30, 90 o 365 días, o nunca, y se revoca desde la misma pantalla. La lista muestra cuándo se usó por última vez. La creación y la revocación quedan en la [auditoría](/taia/referencia/api/#otros).

En Claude Code:

```bash
claude mcp add --transport http taia http://localhost:13336/mcp \
  --header "Authorization: Bearer taia_…"
```

En Claude Desktop, con `mcp-remote`:

```json
{
  "mcpServers": {
    "taia": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:13336/mcp",
               "--header", "Authorization: Bearer ${TAIA_TOKEN}"],
      "env": { "TAIA_TOKEN": "taia_…" }
    }
  }
}
```

Un token revocado deja de funcionar al instante en la web. El servidor MCP guarda en memoria la validación de cada token durante 30 segundos, así que ahí puede tardar hasta ese tiempo.

Además, el servidor rechaza requests con un `Host` que no reconoce (protección contra DNS rebinding). Agregá el nombre público con `MCP_ALLOWED_HOSTS`, separado por comas.
