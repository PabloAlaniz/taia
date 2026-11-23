# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Por igual, devs que trabajan solos y equipos técnicos chicos (2 a 10 personas) que hostean TAIA para coordinar agentes de IA y personas en un mismo tablero. El trabajo típico: repartir tareas entre agentes y personas, seguir en vivo lo que hacen los agentes, aprobar o destrabar pasos y revisar el resultado (diffs, transcripciones, costos).

## Product Purpose

TAIA (Tablero de Agentes IA) es un tablero Kanban en tiempo real más un servidor MCP. Agentes y personas leen, crean y mueven las mismas tareas. Además de coordinar, permite operar agentes: transcripciones en vivo, cron, costos por sesión, aprobaciones, worktrees de git por tarea y un asistente de planificación. Funciona bien cuando el usuario sabe en todo momento qué está haciendo cada agente, en qué tarea y a qué costo, y puede intervenir sin salir del tablero.

## Positioning

Es agnóstico de runtime. OpenClaw, la API de Anthropic, Claude Code, Aider y Cursor se conectan como adapters con sus capacidades declaradas, y en modo standalone no hace falta ninguno (tablero, MCP y CLI). Es self-hosted y todo el estado vive en PostgreSQL. El tablero trata a agentes y personas como participantes del mismo flujo, no como dos sistemas separados.

## Operating Context

- Se instala con Docker Compose y se abre en `http://localhost:13333`. El MCP queda en `:13336/mcp`.
- Los agentes se conectan por MCP (Claude Code, Cursor o cualquier cliente MCP), con 36 herramientas.
- Organización: workspaces con columnas por preset (por ejemplo, Software Dev), swimlanes, dependencias, subtareas, hilos por tarea y proyectos que abarcan varios workspaces.
- Cada tarea puede tener su worktree de git, con diff y merge desde la UI.
- La documentación pública está en `apps/docs` (Astro) y se publica en GitHub Pages.

## Capabilities and Constraints

- Está en alpha: puede haber cambios incompatibles entre versiones.
- Por defecto no pide credenciales. Solo escucha en `127.0.0.1`, y el acceso remoto requiere `TAIA_API_TOKEN` y TLS.
- La UI está en español y portugués (next-intl) y tiene tema claro y oscuro (next-themes).
- Stack: Next.js 16 y React 19 con Tailwind en `apps/web`, Astro en `apps/docs`, monorepo pnpm/turbo.
- Los componentes de `apps/web/components` siguen atomic design (atoms, molecules, organisms, templates).
- Las capacidades dependen del runtime: no todos los adapters exponen sesiones, transcripciones, cron o aprobaciones, y la UI tiene que reflejar qué hay disponible.

## Brand Commitments

- Nombre: "TAIA — Tablero de Agentes IA", con 🧉 como guiño.
- La voz de README y docs es español rioplatense (voseo), directo y técnico.
- Licencia MIT, proyecto público. El contenido es genérico: no aparecen nombres de clientes ni datos personales.

## Evidence on Hand

- Captura del tablero: `docs/assets/board.png`.
- Documentación: `apps/docs`, publicada en pabloalaniz.github.io/taia.
- No hay testimonios, clientes, métricas de uso ni benchmarks. No se inventan.

## Product Principles

1. Agentes y personas son participantes iguales: la misma tarea, el mismo tablero y las mismas reglas.
2. Ningún runtime es obligatorio. La UI muestra lo que el runtime ofrece, no lo que supone.
3. La operación tiene que verse: qué corre, dónde y cuánto cuesta, sin tener que adivinar.
4. Self-hosted y transparente: el estado es tuyo y es legible.

## Accessibility & Inclusion

Pendiente de decidir: todavía no hay un estándar declarado (ya existe un skip-link). La UI es bilingüe (es/pt).
