---
title: Workspaces, columnas y tareas
description: Cómo se organiza el trabajo en TAIA.
sidebar:
  order: 1
---

## Workspaces

Un **workspace** es un tablero independiente, con sus propias columnas, tareas, proyectos y agentes. TAIA crea uno al arrancar, `ws-default`, vacío: el asistente de inicio lo configura con el nombre y las columnas que elijas. Después podés sumar más desde la UI o con la herramienta MCP `taia_create_workspace`.

Las herramientas MCP y la API REST reciben el workspace como parámetro (`workspace_id`) o en el header `x-workspace-id`. Lo que se crea sin indicarlo va a `ws-default`.

Cada workspace tiene sus tareas, su actividad, sus proyectos, sus filtros guardados y sus plantillas; el calendario, las estadísticas y el standup también son por workspace. Se comparten entre todos los agentes, los colores de los tags, los costos, y las plantillas y filtros que vienen predefinidos.

## Columnas y presets

Cada workspace define sus **columnas**. Cada columna tiene:

- un **slug** (por ejemplo, `IN_PROGRESS`), que es el valor que guarda `status` en cada tarea;
- un **label** y un ícono para la UI;
- dos marcas opcionales: **inicial** (donde caen las tareas nuevas) y **terminada** (cuenta como hecha: bloquea el paso si hay dependencias sin resolver);
- un **límite WIP** opcional.

Un workspace nuevo arranca desde un **preset**:

| Preset | Columnas (inicial → terminadas) |
|---|---|
| Software Dev | Ideas · **Backlog** (inicial) · Assigned · In Progress · Review · **Done** · **Rejected** |
| Marketing | **Ideas** (inicial) · Planificado · En Producción · En Revisión · **Publicado** · **Archivado** |
| Escritura | **Ideas** (inicial) · Investigación · Borrador · Edición · Revisión Final · **Publicado** |
| Ventas | **Lead** (inicial) · Contactado · Propuesta · Negociación · **Cerrado-Ganado** · **Cerrado-Perdido** |
| Personalizado | **To Do** (inicial) · In Progress · **Done** |

El status de una tarea tiene que ser una columna de su workspace: la API responde `400 INVALID_STATUS` si no lo es. Una tarea creada sin status va a la columna inicial.

## Tareas

Una **tarea** tiene título, descripción, prioridad (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), tags, responsable, proyecto y fechas. Además:

- **Subtareas:** checklist dentro de la tarea.
- **Dependencias:** una tarea puede estar bloqueada por otras. TAIA detecta ciclos y no deja mover a una columna terminada una tarea con dependencias abiertas.
- **Mensajes:** el hilo de comentarios de la tarea, donde escriben personas y agentes (con menciones `@agente`).
- **Trayectoria:** el historial de cambios de estado y de quién los hizo.
- **Tag `blocked`:** marca una tarea como bloqueada sin moverla de columna.

## Proyectos

Un **proyecto** agrupa tareas y puede tener repositorios asociados, que usan los [worktrees](/taia/guias/worktrees-y-qa/). Los proyectos también aportan contexto a los agentes (descripción y glosario); ver [Modelo de contexto](/taia/arquitectura/modelo-de-contexto/).

## En la UI

- **Swimlanes:** agrupar el tablero por agente, proyecto o prioridad.
- **Filtros guardados:** se sincronizan con la URL, así que se pueden compartir.
- **Templates:** tareas predefinidas para flujos repetitivos.
- **Calendario:** las tareas con fecha.
- **Atajos:** `N` nueva tarea, `/` buscar, `R` refrescar, `Esc` cerrar, `?` ayuda.
- **Idioma:** español o portugués.
