#!/usr/bin/env bash
# Reemplaza la base de TAIA con un volcado hecho por `pnpm db:export`.
# Es una copia en un solo sentido: lo que haya en la base actual se pierde
# (antes se guarda un respaldo automático en backups/).
#
# Uso: pnpm db:import <archivo.dump> [--yes]
set -euo pipefail

# shellcheck source=scripts/db/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

file=""
assume_yes=0
for arg in "$@"; do
  case "$arg" in
    -y | --yes) assume_yes=1 ;;
    -*) die "opción desconocida: $arg" ;;
    *) file="$arg" ;;
  esac
done
[ -n "$file" ] || die "uso: pnpm db:import <archivo.dump> [--yes]"
[ -f "$file" ] || die "no existe: $file"

if [ "$assume_yes" -ne 1 ]; then
  echo "Esto REEMPLAZA la base '$POSTGRES_DB' de esta máquina con $file."
  read -r -p "¿Continuar? [y/N] " answer
  case "$answer" in y | Y | yes | si | sí) ;; *) die "cancelado" ;; esac
fi

ensure_postgres

log "respaldo previo de la base actual..."
bash "$ROOT_DIR/scripts/db/export.sh" "backups/pre-import-$(hostname -s)-$(date +%Y%m%d-%H%M%S).dump"

log "deteniendo app y mcp..."
docker compose stop app mcp >/dev/null 2>&1 || true
# --single-transaction deja la base intacta si la restauración falla:
# en ese caso se vuelve a levantar todo como estaba.
trap 'echo "[db] falló la importación; la base quedó como estaba. Levantando app y mcp..." >&2; docker compose up -d app mcp >/dev/null 2>&1' ERR

log "restaurando $file..."
docker compose exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists --no-owner --no-privileges --single-transaction <"$file"

# Los leases son de los agentes de la otra máquina: acá no tienen dueño.
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q \
  -c "DO \$\$ BEGIN IF to_regclass('public.agent_run_leases') IS NOT NULL THEN DELETE FROM agent_run_leases; END IF; END \$\$;"

trap - ERR

log "levantando app y mcp (aplica migraciones pendientes)..."
docker compose up -d --wait app mcp

if docker compose exec -T app node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON /app/scripts/migrate.mts --check; then
  log "esquema ok"
else
  log "aviso: el esquema de la base no coincide con el código (¿volcado de una versión más nueva?)"
fi

cat <<'MSG'
[db] importación completa.
[db] - Los secretos cifrados solo se leen si TAIA_SECRET_KEY es la misma que en la máquina de origen.
[db] - Revisá los runtimes en Ajustes: sus URLs pueden apuntar a la otra máquina.
MSG
