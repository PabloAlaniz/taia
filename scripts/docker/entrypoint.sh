#!/bin/bash
set -e

# Run database migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Running database migrations..."

  # Wait for PostgreSQL to be ready
  until pg_isready -d "$DATABASE_URL" 2>/dev/null; do
    echo "[entrypoint] Waiting for PostgreSQL..."
    sleep 2
  done

  # Apply pending migrations; a failed migration aborts the boot (set -e).
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON /app/scripts/migrate.mts
  echo "[entrypoint] Migrations complete."
fi

echo ""
echo "==========================================="
echo "  TAIA disponible en http://localhost:13333"
echo "==========================================="
echo ""

# Execute the CMD
exec "$@"
