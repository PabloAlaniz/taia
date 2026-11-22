#!/usr/bin/env bash
# Shared setup for db:export and db:import. Sourced, not executed.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR" || exit 1

# Same defaults as docker-compose.yml; .env overrides them.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
POSTGRES_USER="${POSTGRES_USER:-taia}"
POSTGRES_DB="${POSTGRES_DB:-taia}"

log() { echo "[db] $*"; }
die() { echo "[db] error: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker no está instalado"

ensure_postgres() {
  if ! docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    log "levantando postgres..."
    docker compose up -d --wait postgres >/dev/null
  fi
}
