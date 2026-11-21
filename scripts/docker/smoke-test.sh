#!/usr/bin/env bash
# TAIA Docker Smoke Test
# Usage:
#   bash scripts/docker/smoke-test.sh                    # basic (simulated onboarding)
#   GATEWAY_URL=http://localhost:19001 GATEWAY_TOKEN=xxx bash scripts/docker/smoke-test.sh  # full wizard
set -uo pipefail

PROJECT="taia-smoke-$$"
# Use high ports to avoid conflicts with local services
SMOKE_APP_PORT="${SMOKE_APP_PORT:-13533}"
SMOKE_WS_PORT="${SMOKE_WS_PORT:-13534}"
SMOKE_BC_PORT="${SMOKE_BC_PORT:-13535}"
SMOKE_PG_PORT="${SMOKE_PG_PORT:-5632}"
BASE_URL="http://localhost:$SMOKE_APP_PORT"
PASS=0
FAIL=0
TOTAL=0
LOG_FILE="/tmp/smoke-logs.txt"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); echo -e "  ${GREEN}PASS${NC} $1"; }
fail() { FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); echo -e "  ${RED}FAIL${NC} $1"; }

cleanup() {
  echo ""
  echo "=== Cleanup ==="
  docker compose -p "$PROJECT" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

# Prerequisites
for cmd in curl jq docker; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Required: $cmd"; exit 1; }
done

echo "=== TAIA Docker Smoke Test ==="
echo "Project: $PROJECT"
if [ -n "${GATEWAY_URL:-}" ]; then
  echo -e "Mode: ${YELLOW}Full (with gateway at $GATEWAY_URL)${NC}"
else
  echo "Mode: Basic (simulated onboarding)"
fi
echo ""

# ============================================================
# Phase 1: Build & Boot
# ============================================================
echo "=== Phase 1: Build & Boot ==="
APP_PORT="$SMOKE_APP_PORT" WS_PORT="$SMOKE_WS_PORT" BROADCAST_PORT="$SMOKE_BC_PORT" POSTGRES_PORT="$SMOKE_PG_PORT" \
  docker compose -p "$PROJECT" up -d --build

echo "Waiting for app to be healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=60
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  STATUS=$(curl -sf "$BASE_URL/api/health" 2>/dev/null | jq -r '.status' 2>/dev/null || echo "")
  if [ "$STATUS" = "healthy" ]; then
    break
  fi
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 3
done

if [ "$STATUS" = "healthy" ]; then
  pass "App healthy (${ATTEMPTS} attempts)"
else
  fail "App did not become healthy after $MAX_ATTEMPTS attempts"
  echo "--- Docker logs ---"
  docker compose -p "$PROJECT" logs 2>&1 | tail -50
  exit 1
fi

# ============================================================
# Phase 2: Validate DB Schema
# ============================================================
echo ""
echo "=== Phase 2: DB Schema Validation ==="
DB_CONTAINER=$(docker compose -p "$PROJECT" ps -q postgres)

check_table() {
  local table="$1"
  local count
  count=$(docker exec "$DB_CONTAINER" psql -U taia -d taia -t -c "SELECT count(*) FROM information_schema.tables WHERE table_name='$table'" 2>/dev/null | tr -d ' ')
  if [ "$count" = "1" ]; then
    pass "Table '$table' exists"
  else
    fail "Table '$table' missing"
  fi
}

for table in tasks agents settings workspaces board_columns workspace_presets activities messages notifications subtasks task_tags repositories projects task_dependencies saved_filters workspace_agents column_settings runtime_instances agent_context agent_runtime_settings; do
  check_table "$table"
done

# Check seed data
WS_COUNT=$(docker exec "$DB_CONTAINER" psql -U taia -d taia -t -c "SELECT count(*) FROM workspaces WHERE id='ws-default'" 2>/dev/null | tr -d ' ')
if [ "$WS_COUNT" = "1" ]; then
  pass "Default workspace 'ws-default' seeded"
else
  fail "Default workspace missing (count=$WS_COUNT)"
fi

PRESET_COUNT=$(docker exec "$DB_CONTAINER" psql -U taia -d taia -t -c "SELECT count(*) FROM workspace_presets" 2>/dev/null | tr -d ' ')
if [ "$PRESET_COUNT" -ge 5 ] 2>/dev/null; then
  pass "Workspace presets seeded ($PRESET_COUNT)"
else
  fail "Workspace presets missing (count=$PRESET_COUNT)"
fi

# Migration history: every file recorded, none edited after being applied
MIG_RES=$(curl -s "$BASE_URL/api/health/migrations" || echo '{}')
MIG_STATUS=$(echo "$MIG_RES" | jq -r '.status // "unknown"')
if [ "$MIG_STATUS" = "ok" ]; then
  pass "GET /api/health/migrations -> ok ($(echo "$MIG_RES" | jq -r '.appliedCount') applied)"
else
  fail "GET /api/health/migrations -> $(echo "$MIG_RES" | jq -r '.message // .')"
fi

# ============================================================
# Phase 3: Pre-onboarding API Tests
# ============================================================
echo ""
echo "=== Phase 3: Pre-onboarding API Tests ==="

# Health
HEALTH=$(curl -sf "$BASE_URL/api/health")
DB_CONNECTED=$(echo "$HEALTH" | jq -r '.db.connected')
if [ "$DB_CONNECTED" = "true" ]; then
  pass "GET /api/health -> db.connected=true"
else
  fail "GET /api/health -> db.connected=$DB_CONNECTED"
fi

# Onboarding status
OB_STATUS=$(curl -sf "$BASE_URL/api/onboarding/status")
OB_COMPLETED=$(echo "$OB_STATUS" | jq -r '.completed')
if [ "$OB_COMPLETED" = "false" ]; then
  pass "GET /api/onboarding/status -> completed=false"
else
  fail "GET /api/onboarding/status -> completed=$OB_COMPLETED (expected false)"
fi

# ============================================================
# Phase 4: Onboarding
# ============================================================
echo ""
if [ -n "${GATEWAY_URL:-}" ]; then
  echo "=== Phase 4: Full Wizard (with gateway) ==="

  # Save gateway settings
  SETTINGS_RES=$(curl -sf -X PUT "$BASE_URL/api/settings" \
    -H "Content-Type: application/json" \
    -d "{\"settings\":{\"runtime.default_provider\":\"openclaw\",\"runtime.providers.openclaw.url\":\"$GATEWAY_URL\",\"runtime.providers.openclaw.token\":\"${GATEWAY_TOKEN:-}\"}}")
  SETTINGS_OK=$(echo "$SETTINGS_RES" | jq -r '.ok')
  if [ "$SETTINGS_OK" = "true" ]; then
    pass "PUT /api/settings -> saved gateway config"
  else
    fail "PUT /api/settings -> $SETTINGS_RES"
  fi

  # Test connection
  CONN_RES=$(curl -sf -X POST "$BASE_URL/api/settings/test-connection" \
    -H "Content-Type: application/json" \
    -d "{\"provider\":\"openclaw\",\"url\":\"$GATEWAY_URL\",\"token\":\"${GATEWAY_TOKEN:-}\"}" || echo '{"ok":false,"error":"curl failed"}')
  CONN_OK=$(echo "$CONN_RES" | jq -r '.ok')
  AGENTS_FOUND=$(echo "$CONN_RES" | jq -r '.agents_found // 0')
  if [ "$CONN_OK" = "true" ]; then
    pass "POST /api/settings/test-connection -> ok, $AGENTS_FOUND agents"
  else
    CONN_ERR=$(echo "$CONN_RES" | jq -r '.error // "unknown"')
    fail "POST /api/settings/test-connection -> $CONN_ERR"
  fi

  # Generate setup (this calls OpenClaw, may take up to 90s)
  echo "  Generating setup via OpenClaw (this may take up to 90s)..."
  SETUP_RES=$(curl -s --max-time 180 -X POST "$BASE_URL/api/onboarding/setup" \
    -H "Content-Type: application/json" \
    -d '{"need":"Desarrollo de software"}' 2>&1 || echo '{"ok":false,"error":"curl failed or timeout"}')
  SETUP_OK=$(echo "$SETUP_RES" | jq -r '.ok' 2>/dev/null)
  if [ "$SETUP_OK" = "true" ]; then
    COLS=$(echo "$SETUP_RES" | jq '.setup.workspace.columns | length')
    AGENTS=$(echo "$SETUP_RES" | jq '.setup.agents | length')
    pass "POST /api/onboarding/setup -> $COLS columns, $AGENTS agents suggested"

    # Apply setup
    SETUP_DATA=$(echo "$SETUP_RES" | jq '.setup')
    APPLY_RES=$(curl -sf --max-time 60 -X POST "$BASE_URL/api/onboarding/apply" \
      -H "Content-Type: application/json" \
      -d "{\"setup\":$SETUP_DATA,\"useDefaultWorkspace\":true}" || echo '{"ok":false,"error":"curl failed"}')
    APPLY_OK=$(echo "$APPLY_RES" | jq -r '.ok')
    if [ "$APPLY_OK" = "true" ]; then
      COLS_CREATED=$(echo "$APPLY_RES" | jq -r '.result.columnsCreated // 0')
      AGENTS_CREATED=$(echo "$APPLY_RES" | jq -r '.result.agentsCreated // 0')
      pass "POST /api/onboarding/apply -> $COLS_CREATED columns, $AGENTS_CREATED agents created"
    else
      APPLY_ERR=$(echo "$APPLY_RES" | jq -r '.error // "unknown"')
      fail "POST /api/onboarding/apply -> $APPLY_ERR"
    fi

    # Verify columns were created in DB
    COL_COUNT=$(docker exec "$DB_CONTAINER" psql -U taia -d taia -t -c "SELECT count(*) FROM board_columns WHERE workspace_id='ws-default'" 2>/dev/null | tr -d ' ')
    if [ "${COL_COUNT:-0}" -gt 0 ] 2>/dev/null; then
      pass "board_columns has $COL_COUNT columns for ws-default"
    else
      fail "board_columns empty after apply (count=$COL_COUNT)"
    fi
  else
    SETUP_ERR=$(echo "$SETUP_RES" | jq -r '.error // "unknown"' 2>/dev/null)
    fail "POST /api/onboarding/setup -> $SETUP_ERR"
    echo -e "  ${YELLOW}SKIP${NC} apply + columns check (setup failed)"
  fi

  # Complete onboarding
  COMPLETE_RES=$(curl -sf -X POST "$BASE_URL/api/onboarding/complete" \
    -H "Content-Type: application/json" -d '{}')
  COMPLETE_OK=$(echo "$COMPLETE_RES" | jq -r '.ok')
  if [ "$COMPLETE_OK" = "true" ]; then
    pass "POST /api/onboarding/complete -> ok"
  else
    fail "POST /api/onboarding/complete -> $COMPLETE_RES"
  fi

else
  echo "=== Phase 4: Simulated Onboarding (no gateway) ==="

  COMPLETE_RES=$(curl -sf -X POST "$BASE_URL/api/onboarding/complete" \
    -H "Content-Type: application/json" -d '{}')
  COMPLETE_OK=$(echo "$COMPLETE_RES" | jq -r '.ok')
  if [ "$COMPLETE_OK" = "true" ]; then
    pass "POST /api/onboarding/complete -> ok"
  else
    fail "POST /api/onboarding/complete -> $COMPLETE_RES"
  fi

  OB_VERIFY=$(curl -sf "$BASE_URL/api/onboarding/status")
  OB_NOW=$(echo "$OB_VERIFY" | jq -r '.completed')
  if [ "$OB_NOW" = "true" ]; then
    pass "GET /api/onboarding/status -> completed=true"
  else
    fail "GET /api/onboarding/status -> completed=$OB_NOW (expected true)"
  fi
fi

# ============================================================
# Phase 5: Post-onboarding API Tests
# ============================================================
echo ""
echo "=== Phase 5: Post-onboarding API Tests ==="

# Tasks
TASKS_CODE=$(curl -sf -o /dev/null -w '%{http_code}' "$BASE_URL/api/tasks" 2>/dev/null || echo "000")
if [ "$TASKS_CODE" = "200" ]; then
  pass "GET /api/tasks -> 200"
else
  fail "GET /api/tasks -> $TASKS_CODE"
fi

# Agents
AGENTS_RES=$(curl -sf "$BASE_URL/api/agents" || echo '{}')
AGENTS_OK=$(echo "$AGENTS_RES" | jq -r '.ok // false')
if [ "$AGENTS_OK" = "true" ]; then
  pass "GET /api/agents -> ok"
else
  fail "GET /api/agents -> $AGENTS_RES"
fi

# Workspaces
WS_RES=$(curl -sf "$BASE_URL/api/workspaces" || echo '{}')
WS_HAS_DEFAULT=$(echo "$WS_RES" | jq '[.workspaces[]? | select(.id=="ws-default")] | length')
if [ "$WS_HAS_DEFAULT" = "1" ]; then
  pass "GET /api/workspaces -> contains ws-default"
else
  fail "GET /api/workspaces -> ws-default not found"
fi

# Columns
COLS_CODE=$(curl -sf -o /dev/null -w '%{http_code}' "$BASE_URL/api/workspaces/ws-default/columns" 2>/dev/null || echo "000")
if [ "$COLS_CODE" = "200" ]; then
  pass "GET /api/workspaces/ws-default/columns -> 200"
else
  fail "GET /api/workspaces/ws-default/columns -> $COLS_CODE"
fi

# ============================================================
# Phase 6: Docker Log Analysis
# ============================================================
echo ""
echo "=== Phase 6: Docker Log Analysis ==="

docker compose -p "$PROJECT" logs app 2>&1 > "$LOG_FILE"

# Check for migration success
if grep -q "Migrations complete" "$LOG_FILE"; then
  pass "Entrypoint logged 'Migrations complete'"
else
  fail "Entrypoint did not log 'Migrations complete'"
fi

# Check for error patterns (exclude PostgreSQL NOTICE which are harmless migration messages)
ERROR_COUNT=$(grep -iE '(unhandled|FATAL|missing.*table|relation.*does not exist|panic)' "$LOG_FILE" | grep -cvE 'NOTICE:' || true)
if [ "${ERROR_COUNT:-0}" -eq 0 ]; then
  pass "No fatal error patterns in Docker logs"
else
  fail "Found $ERROR_COUNT error patterns in Docker logs"
  grep -iE '(unhandled|FATAL|missing.*table|relation.*does not exist|panic)' "$LOG_FILE" | grep -vE 'NOTICE:' | head -10
fi

# ============================================================
# Phase 6b: Second boot (migrations must be a no-op)
# ============================================================
echo ""
echo "=== Phase 6b: Second boot ==="
docker compose -p "$PROJECT" restart app >/dev/null 2>&1
ATTEMPTS=0
STATUS=""
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  STATUS=$(curl -sf "$BASE_URL/api/health" 2>/dev/null | jq -r '.status' 2>/dev/null || echo "")
  [ "$STATUS" = "healthy" ] && break
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 3
done
if [ "$STATUS" = "healthy" ]; then
  pass "App healthy after restart"
else
  fail "App did not become healthy after restart"
fi

docker compose -p "$PROJECT" logs app 2>&1 > "$LOG_FILE"
APPLIED_RUNS=$(grep -cE '\[migrate\] [0-9]+ applied' "$LOG_FILE" || true)
if [ "${APPLIED_RUNS:-0}" -ge 2 ] && grep -qE '\[migrate\] 0 applied' "$LOG_FILE"; then
  pass "Second boot applied no migrations"
else
  fail "Second boot did not report '0 applied' (runs=$APPLIED_RUNS)"
  grep -E '\[migrate\]' "$LOG_FILE" | tail -5
fi

# ============================================================
# Phase 7: Summary
# ============================================================
echo ""
echo "==============================="
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}ALL $TOTAL TESTS PASSED${NC}"
  exit 0
else
  echo -e "${RED}$FAIL/$TOTAL TESTS FAILED${NC}"
  exit 1
fi
