#!/usr/bin/env bash
#
# connect-claude-desktop.sh — Conecta el servidor MCP de TAIA con Claude Desktop.
#
# A diferencia de Claude Code (que lee el .mcp.json del repo directamente),
# Claude Desktop carga los servidores MCP desde su propio archivo de
# configuracion. Este script agrega — de forma idempotente y con backup — una
# entrada "taia" que puentea (via `mcp-remote`) al servidor MCP HTTP que ya corre
# dentro del stack de Docker en http://localhost:13336/mcp.
#
# Por que el bridge y no stdio directo:
#   - Reusa el server HTTP del contenedor `mcp`, que ya tiene la DB bien resuelta
#     (evita el clasico `role "taia" does not exist` por pegarle a otro Postgres).
#   - Evita que el banner de pnpm/npm contamine el stdout y rompa el JSON-RPC.
#
# Uso:
#   ./scripts/dev/connect-claude-desktop.sh
#   MCP_PORT=13336 ./scripts/dev/connect-claude-desktop.sh   # puerto custom (multi-instancia)
#
set -euo pipefail

MCP_PORT="${MCP_PORT:-13336}"
MCP_URL="http://localhost:${MCP_PORT}/mcp"

# Shell de login del usuario: asegura que npx/node esten en el PATH cuando la app
# GUI spawnee el proceso (las apps de macOS no heredan el PATH del shell).
SHELL_BIN="${SHELL:-/bin/zsh}"

# Ruta del config de Claude Desktop segun el sistema operativo.
case "$(uname -s)" in
  Darwin) CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json" ;;
  Linux)  CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/Claude/claude_desktop_config.json" ;;
  *)      echo "[connect-claude-desktop] SO no soportado por este script. Edita el config a mano." >&2; exit 1 ;;
esac

mkdir -p "$(dirname "$CONFIG")"
[ -f "$CONFIG" ] || echo '{}' > "$CONFIG"

# Backup con timestamp.
BACKUP="$CONFIG.bak.$(date +%Y%m%d%H%M%S)"
cp "$CONFIG" "$BACKUP"
echo "[connect-claude-desktop] Backup: $BACKUP"

# Merge de la entrada "taia" usando Node (siempre disponible en este repo),
# preservando cualquier otra clave existente del config.
CONFIG="$CONFIG" MCP_URL="$MCP_URL" SHELL_BIN="$SHELL_BIN" node -e '
  const fs = require("fs");
  const path = process.env.CONFIG;
  const url = process.env.MCP_URL;
  const shell = process.env.SHELL_BIN;
  const cfg = JSON.parse(fs.readFileSync(path, "utf8") || "{}");
  cfg.mcpServers = cfg.mcpServers || {};
  cfg.mcpServers.taia = {
    command: shell,
    args: ["-lc", `exec npx -y mcp-remote ${url}`]
  };
  fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
  console.log("[connect-claude-desktop] taia agregado a", path);
'

# Health check del server MCP (opcional pero util).
if curl -fsS "http://localhost:${MCP_PORT}/health" >/dev/null 2>&1; then
  echo "[connect-claude-desktop] Server MCP OK en :${MCP_PORT}"
else
  echo "[connect-claude-desktop] AVISO: http://localhost:${MCP_PORT}/health no responde."
  echo "[connect-claude-desktop]        Levanta el stack:  docker compose up -d postgres mcp"
fi

echo "[connect-claude-desktop] Listo. Cerra Claude Desktop del todo (Cmd+Q) y reabrilo,"
echo "[connect-claude-desktop] luego abri una sesion nueva: deberian aparecer las tools de taia."
