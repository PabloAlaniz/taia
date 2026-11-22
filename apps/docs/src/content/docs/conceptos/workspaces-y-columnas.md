---
title: Workspaces, columnas y proyectos
description: Cómo se organiza el trabajo en TAIA.
sidebar:
  order: 1
---

## Dos ejes: cómo y para quién

TAIA organiza el trabajo en dos ejes que se cruzan:

- **Workspace: cómo se trabaja.** Un flujo con sus propias columnas, agentes y filtros. Por ejemplo, *Desarrollo*, *Escritura* u *Operaciones*.
- **Proyecto: para quién o sobre qué.** Un cliente, un producto o un tema, con su contexto (descripción, glosario, repositorios). Sus tareas pueden estar en cualquier workspace.

```
               Desarrollo   Escritura   Operaciones
  Cliente A       ■■■           ■            ■■
  Producto B      ■■            ■■           —
```

Cada **tarea** vive en un workspace, que le da su columna, y opcionalmente en un proyecto, que le da el contexto. Un agente que trabaja una tarea recibe el contexto del proyecto de esa tarea, sin importar en qué workspace esté (ver [Modelo de contexto](/taia/arquitectura/modelo-de-contexto/)).

## Workspaces

Un **workspace** es un tablero independiente, con sus propias columnas, tareas y agentes. TAIA crea uno al arrancar, `ws-default`, vacío: el asistente de inicio lo configura con el nombre y las columnas que elijas. Después podés sumar más desde la UI o con la herramienta MCP `taia_create_workspace`.

Las herramientas MCP y la API REST reciben el workspace como parámetro (`workspace_id`) o en el header `x-workspace-id`. Lo que se crea sin indicarlo va a `ws-default`.

Cada workspace tiene sus tareas, su actividad, sus filtros guardados y sus plantillas; el calendario, las estadísticas y el standup también son por workspace. Se comparten entre todos los workspaces los proyectos, los colores de los tags, los costos, y las plantillas y filtros que vienen predefinidos.

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

Un **proyecto** agrupa las tareas para un cliente, un producto o un tema, en cualquier workspace. Tiene:

- **Contexto para los agentes:** descripción, glosario y referencias, con historial de versiones. Llega a cualquier agente que trabaje una tarea del proyecto.
- **Repositorios**, que usan los [worktrees](/taia/guias/worktrees-y-qa/) de sus tareas.

La sección **Proyectos** (🗂️ en el header) lista todos los proyectos. La vista de cada uno muestra sus tareas agrupadas por workspace, cada grupo con las columnas de su workspace. Por MCP: `taia_list_projects` y `taia_create_project`.

Un proyecto puede tener un workspace de origen (`workspace_id`), solo informativo: si ese workspace se borra, el proyecto sigue.

## En la UI

- **Swimlanes:** agrupar el tablero por agente, proyecto o prioridad. Por proyecto es la forma de separar clientes dentro de un mismo workspace.
- **Filtros guardados:** se sincronizan con la URL, así que se pueden compartir.
- **Templates:** tareas predefinidas para flujos repetitivos.
- **Calendario:** las tareas con fecha.
- **Atajos:** `N` nueva tarea, `/` buscar, `R` refrescar, `Esc` cerrar, `?` ayuda.
- **Idioma:** español o portugués.
