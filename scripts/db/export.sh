#!/usr/bin/env bash
# Vuelca la base de TAIA a un archivo portable (formato custom de pg_dump).
#
# Uso: pnpm db:export [archivo.dump]
# Por defecto escribe backups/taia-<host>-<fecha>.dump
set -euo pipefail

# shellcheck source=scripts/db/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

out="${1:-backups/taia-$(hostname -s)-$(date +%Y%m%d-%H%M%S).dump}"
mkdir -p "$(dirname "$out")"

ensure_postgres

log "exportando $POSTGRES_DB → $out"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT
docker compose exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom --no-owner --no-privileges >"$tmp"
mv "$tmp" "$out"
trap - EXIT

log "listo: $out ($(du -h "$out" | cut -f1))"
