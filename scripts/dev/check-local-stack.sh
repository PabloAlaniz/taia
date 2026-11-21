#!/usr/bin/env bash
set -euo pipefail

APP_URL="${TAIA_APP_URL:-${TAIA_URL:-http://127.0.0.1:13333}}"
MCP_URL="${TAIA_MCP_URL:-http://127.0.0.1:13336/mcp}"
WORKSPACE_ID="${TAIA_WORKSPACE_ID:-${WORKSPACE_ID:-ws-default}}"
TIMEOUT_SECONDS="${TAIA_CHECK_TIMEOUT_SECONDS:-5}"
TMP_DIR="${TMPDIR:-/tmp}"
APP_HEALTH_FILE="${TMP_DIR%/}/taia-check-app-health.$$.json"
APP_TASKS_FILE="${TMP_DIR%/}/taia-check-app-tasks.$$.json"
MCP_INIT_FILE="${TMP_DIR%/}/taia-check-mcp-init.$$.txt"
MCP_TASKS_FILE="${TMP_DIR%/}/taia-check-mcp-tasks.$$.txt"

cleanup() {
  rm -f "$APP_HEALTH_FILE" "$APP_TASKS_FILE" "$MCP_INIT_FILE" "$MCP_TASKS_FILE"
}
trap cleanup EXIT

fail() {
  echo "[check-local-stack] ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

fetch_json() {
  local url="$1"
  local output_file="$2"
  local label="$3"
  local http_code
  http_code=$(curl -sS --max-time "$TIMEOUT_SECONDS" --output "$output_file" --write-out '%{http_code}' "$url") || fail "$label is not reachable at $url"
  [[ "$http_code" =~ ^2[0-9][0-9]$ ]] || fail "$label returned HTTP $http_code at $url"
}

post_json() {
  local url="$1"
  local payload="$2"
  local output_file="$3"
  local label="$4"
  local http_code
  http_code=$(curl -sS --max-time "$TIMEOUT_SECONDS" --output "$output_file" --write-out '%{http_code}' \
    -X POST "$url" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    --data "$payload") || fail "$label is not reachable at $url"
  [[ "$http_code" =~ ^2[0-9][0-9]$ ]] || fail "$label returned HTTP $http_code at $url"
}

require_command curl
require_command node

APP_URL="${APP_URL%/}"
TASKS_URL="$APP_URL/api/tasks?workspace_id=$WORKSPACE_ID"

fetch_json "$APP_URL/api/health" "$APP_HEALTH_FILE" "TAIA app health"
fetch_json "$TASKS_URL" "$APP_TASKS_FILE" "TAIA app tasks for workspace $WORKSPACE_ID"

node - "$APP_HEALTH_FILE" "$APP_TASKS_FILE" "$WORKSPACE_ID" <<'NODE'
const fs = require('node:fs')
const [healthPath, tasksPath, workspaceId] = process.argv.slice(2)
const health = JSON.parse(fs.readFileSync(healthPath, 'utf8'))
if (health.status !== 'healthy') {
  throw new Error(`app health status is ${JSON.stringify(health.status)}, expected healthy`)
}
if (!health.db?.connected) {
  throw new Error('app health reports db.connected=false')
}
const payload = JSON.parse(fs.readFileSync(tasksPath, 'utf8'))
const tasks = Array.isArray(payload.tasks) ? payload.tasks : []
if (payload.total !== tasks.length) {
  throw new Error(`app tasks total mismatch: total=${payload.total}, tasks.length=${tasks.length}`)
}
const wrong = tasks.filter((task) => task.workspace_id !== workspaceId)
if (wrong.length > 0) {
  throw new Error(`app returned ${wrong.length} task(s) outside workspace ${workspaceId}: ${wrong.slice(0, 5).map((t) => t.id).join(', ')}`)
}
console.log(`[check-local-stack] app ok: healthy DB, ${tasks.length} task(s) scoped to workspace ${workspaceId}`)
NODE

INIT_PAYLOAD='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"taia-check-local-stack","version":"1.0.0"}}}'
post_json "$MCP_URL" "$INIT_PAYLOAD" "$MCP_INIT_FILE" "TAIA MCP initialize"

node - "$MCP_INIT_FILE" <<'NODE'
const fs = require('node:fs')
const raw = fs.readFileSync(process.argv[2], 'utf8')
const line = raw.split(/\r?\n/).find((entry) => entry.startsWith('data: '))
const payload = JSON.parse(line ? line.slice(6) : raw)
if (payload.error) {
  throw new Error(`MCP initialize returned error: ${JSON.stringify(payload.error)}`)
}
if (!payload.result?.serverInfo?.name) {
  throw new Error('MCP initialize response did not include serverInfo.name')
}
console.log(`[check-local-stack] mcp ok: initialize responded from ${payload.result.serverInfo.name}`)
NODE

CALL_PAYLOAD=$(node -e 'const workspaceId = process.argv[1]; process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"taia_list_tasks",arguments:{workspace_id:workspaceId}}}))' "$WORKSPACE_ID")
post_json "$MCP_URL" "$CALL_PAYLOAD" "$MCP_TASKS_FILE" "TAIA MCP taia_list_tasks"

node - "$MCP_TASKS_FILE" "$WORKSPACE_ID" <<'NODE'
const fs = require('node:fs')
const [path, workspaceId] = process.argv.slice(2)
const raw = fs.readFileSync(path, 'utf8')
const line = raw.split(/\r?\n/).find((entry) => entry.startsWith('data: '))
const payload = JSON.parse(line ? line.slice(6) : raw)
if (payload.error) {
  throw new Error(`MCP taia_list_tasks returned error: ${JSON.stringify(payload.error)}`)
}
const text = payload.result?.content?.find((item) => item.type === 'text')?.text
if (!text) {
  throw new Error('MCP taia_list_tasks response did not include text content')
}
const data = JSON.parse(text)
const tasks = Array.isArray(data.tasks) ? data.tasks : []
if (data.total !== tasks.length) {
  throw new Error(`MCP tasks total mismatch: total=${data.total}, tasks.length=${tasks.length}`)
}
const wrong = tasks.filter((task) => task.workspace_id !== undefined && task.workspace_id !== workspaceId)
if (wrong.length > 0) {
  throw new Error(`MCP returned ${wrong.length} task(s) outside workspace ${workspaceId}: ${wrong.slice(0, 5).map((t) => t.id).join(', ')}`)
}
if (tasks.length === 0) {
  console.log(`[check-local-stack] mcp ok: taia_list_tasks returned 0 task(s) for workspace ${workspaceId}`)
} else if (tasks.every((task) => task.workspace_id === workspaceId)) {
  console.log(`[check-local-stack] mcp ok: ${tasks.length} task(s) explicitly scoped to workspace ${workspaceId}`)
} else {
  console.log(`[check-local-stack] mcp ok: ${tasks.length} task(s) returned for workspace ${workspaceId}; response omits workspace_id, so filter accepted by request contract`)
}
NODE

echo "[check-local-stack] DONE app=$APP_URL mcp=$MCP_URL workspace_id=$WORKSPACE_ID"

if [[ "${TAIA_SKIP_RUNTIME_TARGET_CHECK:-0}" != "1" ]]; then
  TAIA_APP_URL="$APP_URL" TAIA_MCP_URL="$MCP_URL" TAIA_WORKSPACE_ID="$WORKSPACE_ID" \
    node "$(dirname "$0")/check-runtime-target.mjs"
fi
