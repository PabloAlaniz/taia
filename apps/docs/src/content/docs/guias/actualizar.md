---
title: Actualizar, migraciones y backups
description: Pasar a una versión nueva sin perder datos.
sidebar:
  order: 10
---

## Actualizar

Con el stack de producción:

```bash
git pull
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```

Si usás la imagen de GHCR, cambiá el tag y recreá los contenedores. Las migraciones pendientes se aplican solas al arrancar.

TAIA está en alpha: puede haber cambios incompatibles entre versiones. Leé el [CHANGELOG](https://github.com/PabloAlaniz/taia/blob/main/CHANGELOG.md) antes de actualizar y hacé un backup.

## Migraciones

El esquema vive en `packages/core/migrations/`. Arranca con `0001_baseline.sql` y cada cambio posterior es un archivo nuevo numerado (`0002_<nombre>.sql`, …).

- Cada archivo se aplica **una sola vez**, en su propia transacción, y queda registrado con su checksum en `taia_schema_migrations`.
- Si una migración falla, el arranque se aborta y la base queda como estaba antes de ese archivo.
- `pnpm check:migrations` y `GET /api/health/migrations` comparan el historial con el código: detectan migraciones faltantes, desconocidas, fuera de orden o modificadas después de aplicarse.
- Una base que tiene tablas de TAIA pero no `taia_schema_migrations` se rechaza. Pasa con instalaciones previas a la primera versión pública: arrancá con una base vacía.

Para contribuir con un cambio de esquema, ver [CONTRIBUTING](https://github.com/PabloAlaniz/taia/blob/main/.github/CONTRIBUTING.md).

## Backups

Todo el estado de TAIA está en PostgreSQL. Con el contenedor del stack:

```bash
# backup
docker compose exec -T postgres pg_dump -U taia -d taia --format=custom > taia-$(date +%F).dump

# restore sobre una base vacía
docker compose exec -T postgres pg_restore -U taia -d taia --clean --if-exists < taia-2026-11-01.dump
```

Con una base gestionada, usá sus backups automáticos. Los worktrees y los artefactos de QA viven en disco; si los necesitás, respaldá también esas rutas.
