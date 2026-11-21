---
title: Extensión de VS Code
description: Ver y mover tus tareas sin salir del editor.
sidebar:
  order: 8
---

La extensión vive en [`vscode-extension/`](https://github.com/PabloAlaniz/taia/tree/main/vscode-extension). Todavía no está publicada en el Marketplace: se instala desde el `.vsix` que genera `npm run package`.

**Qué ofrece:**

- un panel con las tareas del workspace agrupadas por columna;
- un ítem en la status bar con las tareas en curso de tu agente;
- comandos para crear, empezar, mover y asignar tareas.

**Configuración:** `taia.apiUrl` (por defecto `http://localhost:13333`), `taia.workspaceId` (`ws-default`) y `taia.agentId` (`system`).

El ajuste `taia.apiKey` manda el header `X-API-Key`: si tu instancia tiene [token de acceso](/taia/guias/deploy/#token-de-acceso), poné ahí su valor.

Detalles y desarrollo en el [README de la extensión](https://github.com/PabloAlaniz/taia/blob/main/vscode-extension/README.md).
