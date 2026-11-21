# Contribuir a TAIA

¡Gracias por tu interés en contribuir! Esta guía te ayudará a comenzar.

## Antes de empezar

- **Bugs y fixes pequeños** → Abrí un PR directo
- **Features nuevas** → Abrí un issue o una discussion primero para acordar el enfoque
- **Preguntas** → GitHub Discussions
- **Cómo funciona TAIA** → la [documentación](https://pabloalaniz.github.io/taia/), sobre todo [Arquitectura](https://pabloalaniz.github.io/taia/arquitectura/vision-general/)

## Configuración del entorno

```bash
# Requisitos: Node.js 26 y pnpm 9.15 (corepack enable)

# 1. Clonar e instalar
git clone https://github.com/PabloAlaniz/taia.git
cd taia
pnpm install

# 2. Levantar PostgreSQL (vía Docker, solo en 127.0.0.1)
pnpm db:up

# 3. Aplicar las migraciones
pnpm migrate

# 4. Web + WebSocket en http://localhost:13333
pnpm dev

# 5. (otra terminal) Servidor MCP por HTTP en http://localhost:13336/mcp
pnpm -F @taia/mcp start:http
```

Los defaults de conexión (`taia:taia@localhost:5432/taia`) apuntan al Postgres de `pnpm db:up`, así que no hace falta configurar nada. Para usar otra base, exportá `DATABASE_URL` en tu shell. Next.js solo lee `.env.local` desde `apps/web/`, y `pnpm migrate` y el servidor MCP leen solo el entorno. La lista de variables está en [Configuración](https://pabloalaniz.github.io/taia/referencia/configuracion/).

Con `pnpm dev`, la app, el WebSocket y el MCP escuchan solo en `127.0.0.1`. Para probar desde otro dispositivo de tu red, `TAIA_BIND_HOST=0.0.0.0 pnpm dev` (sin `TAIA_API_TOKEN` no pide credenciales: hacelo solo en una red que controlás).

## Estructura del proyecto

```
apps/
  web/              # Next.js App (@taia/web) y el servidor WebSocket (scripts/ws-server.js)
  mcp/              # Servidor MCP para agentes IA (@taia/mcp)
  docs/             # Sitio de documentación (Astro Starlight, @taia/docs)
packages/
  types/            # @taia/types — tipos de dominio (zero deps)
  runtime/          # @taia/runtime — interfaz AgentRuntimeAdapter + un adapter por runtime
  core/             # @taia/core — backend engine (DB, services, events, pool de runtimes)
                    #   migrations/ — esquema SQL (0001_baseline.sql + cambios numerados)
  domain/           # @taia/domain — reglas DDD
tools/
  cli/              # @taia/cli — CLI standalone (HTTP)
vscode-extension/   # Extensión de VS Code (sidebar de tareas)
scripts/            # CLI de migraciones (migrate.mts), Docker (docker/) y diagnóstico local (dev/)
```

## Patrones clave

- **Rutas = controladores delgados**: parsear → validar con Zod → llamar servicio → retornar `apiOk()`/`apiError()`
- **DB via repositorios**: Importar desde `@taia/core/db`
- **Servicios**: Lógica de negocio en `@taia/core/services/*`
- **Tipos**: Dominio en `@taia/types`
- **Errores**: Usar `AppError`, `NotFoundError`, `ValidationError` de `@taia/core/errors`

## Tests

```bash
# Suite completa
pnpm test

# Package específico
pnpm -F @taia/core test
pnpm -F @taia/web test

# Watch mode
pnpm -F @taia/core test:watch

# Integration contra un PostgreSQL real
pnpm db:test:up                                   # Postgres de test en el puerto 5433
pnpm -F @taia/core test:integration
```

CI corre `pnpm turbo test:coverage`: cada paquete falla si su cobertura baja del piso definido en su `vitest.config.ts`. Los pisos reflejan la cobertura real sobre todo el código fuente; si sumás tests, subilos.

La suite de integración usa `TEST_DATABASE_URL` (por defecto, `postgresql://taia_test:test@localhost:5433/taia_test`) y **vacía esa base**: no la apuntes a una con datos. Sin base disponible, las suites se saltean; con `REQUIRE_TEST_DB=1` (como en CI), fallan.

### Secretos

CI escanea los commits de cada PR con [gitleaks](https://github.com/gitleaks/gitleaks). Si lo tenés instalado, el hook de pre-commit corre el mismo escaneo sobre lo que estás por commitear. Los fixtures de tests están excluidos en `.gitleaks.toml`.

### End-to-end

`apps/web/e2e/` recorre el flujo principal en un navegador real (Playwright) contra la app buildeada y un PostgreSQL: onboarding, crear una tarea y moverla.

```bash
pnpm db:test:up                                   # Postgres de test en el puerto 5433
pnpm -F @taia/web exec playwright install chromium   # solo la primera vez
pnpm turbo build --filter=@taia/web
pnpm -F @taia/web test:e2e
```

Levanta sus propios servidores (puerto 13433, y 13443 con token de acceso) y **vacía la base de `E2E_DATABASE_URL`** (por defecto, la misma base de test que la suite de integración) antes de cada corrida.

### Cambios de esquema

El esquema vive en `packages/core/migrations/`. Para cambiarlo, agregá un archivo nuevo con el número siguiente (`0002_<nombre>.sql`). Nunca edites una migración que ya se aplicó: el runner guarda el checksum y aborta el arranque si cambia. Probalo con `pnpm migrate` y con `pnpm check:migrations`.

### Tests de integración por runtime

Cada runtime que necesita un servicio externo tiene su propia suite de integración, que se saltea si el servicio no está disponible. El adapter de Anthropic y el noop pasan la suite de contrato (`packages/runtime/__tests__/contract/`) con fakes; los adapters CLI se cubren con `cli-lifecycle.test.ts`. Si agregás un runtime con servicio externo, sumá su suite acá con el mismo patrón.

#### OpenClaw

La suite `packages/core/__tests__/integration/openclaw-adapter` corre contra un gateway real (protocolo v4):

```bash
export OPENCLAW_GATEWAY_URL=http://localhost:18789
export OPENCLAW_GATEWAY_TOKEN=<gateway.auth.token>
export DATABASE_URL=postgresql://...   # base migrada para los smoke tests de consumidores
# opcional: INTEGRATION_TEST_MUTATE=1 habilita los tests que crean sesiones y crons
pnpm -F @taia/core test:integration
```

La primera vez el gateway pide aprobar el dispositivo de test: el setup imprime `openclaw devices approve <requestId>`. Después de aprobarlo, la identidad queda guardada (por defecto en el directorio temporal del sistema; `OPENCLAW_TEST_IDENTITY_FILE` la cambia) y no hay que repetirlo. Usá una base distinta de `TEST_DATABASE_URL`: los tests de DB la vacían.

## Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/). El CI valida esto automáticamente.

```bash
# Formato
<type>(<scope>): <descripción>

# Ejemplos
feat(api): agregar endpoint de swimlanes
fix(web): corregir drag-drop en mobile
docs: actualizar guía de instalación
test(core): agregar tests de detección de ciclos
chore(deps): actualizar vitest
```

**Tipos permitidos:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `deps`

## Pull Requests

### Antes de abrir el PR

```bash
# Validar todo localmente
pnpm lint
pnpm test
pnpm build
```

### Checklist del PR

- [ ] Tests pasan localmente
- [ ] Commits siguen conventional commits
- [ ] Documentación actualizada (si aplica)
- [ ] PR enfocado (una cosa por PR)

### CI Pipeline

El CI corre automáticamente:

1. **Lint & Security** — formato (Biome), ESLint, typecheck, tests de arquitectura (dependency-cruiser), tests de los scripts de `scripts/dev/` y `pnpm audit` (informativo)
2. **Commit messages** — commitlint
3. **Build & Test** — tests unitarios y build
4. **Docker Smoke** — la imagen buildea, arranca, migra y responde
5. **Integration** — tests contra PostgreSQL real

Los PRs que solo tocan documentación (`*.md`, `docs/`, `apps/docs/`) se saltean los jobs pesados. El sitio de docs se valida aparte, en el workflow `Docs`.

## Reportar problemas

Usá las plantillas de issues:
- 🐛 **Bug Report** — Para bugs con pasos de reproducción
- ✨ **Feature Request** — Para propuestas de funcionalidad
- 🔌 **New Runtime Adapter** — Para proponer un runtime nuevo o ampliar uno existente

Las vulnerabilidades **no** van en issues: ver [SECURITY.md](SECURITY.md).

## Documentación

La documentación de uso vive en el sitio ([`apps/docs`](apps/docs), Astro Starlight), que se publica en GitHub Pages en cada push a `main`. Para verlo en local:

```bash
pnpm -F @taia/docs dev
```

Las páginas de referencia (herramientas MCP, índice de rutas de la API) y los ADRs se generan desde el código y desde `docs/adr/` con `scripts/docs/gen-reference.mts`: no se editan a mano. Si cambiás una feature, actualizá su página en el mismo PR.

## Idioma

La documentación, el README y los mensajes de la UI están en español. El código, los comentarios y los commits, en inglés. Issues y PRs, en el idioma que prefieras.

## Código de conducta

Por favor leé nuestro [Código de Conducta](CODE_OF_CONDUCT.md) antes de contribuir.

---

¿Dudas? Abrí una [Discussion](https://github.com/PabloAlaniz/taia/discussions) 💬

## Publicar una versión

1. Subí `version` en todos los `package.json` del monorepo (van juntos; `vscode-extension` tiene la suya).
2. En `CHANGELOG.md`, renombrá `## [Sin publicar]` a `## [vX.Y.Z] - AAAA-MM-DD`, dejá arriba un `## [Sin publicar]` vacío y actualizá los links del final: `[Sin publicar]` compara desde el tag nuevo y `[vX.Y.Z]` apunta a su release.
3. Mergeá a `main` y creá el tag `vX.Y.Z` sobre ese commit.

El workflow `Release` verifica que el tag coincida con `package.json` y que el CHANGELOG tenga esa sección; después corre los checks, publica la imagen en GHCR y crea el release de GitHub con esa sección como notas.
