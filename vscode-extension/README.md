# Extensión de TAIA para VS Code

Sidebar y status bar para trabajar con las tareas de TAIA desde VS Code, contra la API de una instancia local.

## Qué hace

- Un panel en la barra de actividad con las tareas agrupadas por columna.
- Un ítem en la status bar con el agente configurado y cuántas tareas tiene en `IN_PROGRESS`.
- Comandos para configurar y probar la conexión, elegir el workspace, refrescar, crear, empezar, mover y asignar tareas.

`TAIA: Begin Task` mueve la tarea a `IN_PROGRESS`, el slug del preset Software Dev. En workspaces con otras columnas, usá `TAIA: Move Task`.

## Ajustes

| Ajuste | Default | Para qué |
|---|---|---|
| `taia.apiUrl` | `http://localhost:13333` | URL de TAIA |
| `taia.workspaceId` | `ws-default` | Workspace de las tareas (`ws-default` se crea al arrancar) |
| `taia.agentId` | `system` | Actor de los cambios. Usá `system` salvo que tengas un agente registrado en TAIA |
| `taia.apiKey` | — | Se manda como `X-API-Key`. Si la instancia tiene token de acceso (`TAIA_API_TOKEN`), poné ahí su valor |

Desde la paleta de comandos: **TAIA: Setup Connection** configura los ajustes, **TAIA: Select Workspace** elige un workspace de la API y **TAIA: Test Connection** prueba la conexión y muestra cuántas tareas y agentes encontró.

## Desarrollo

```bash
npm install
npm run compile
npm run package
```

Corré la extensión desde VS Code con un Extension Development Host, o instalá el `.vsix` generado con `code --install-extension <archivo>.vsix`.
