import * as vscode from 'vscode'
import { TaiaApiClient } from './api-client'
import { TaskTreeProvider } from './task-tree'
import type { TaiaConfig, TaiaTask, TaskStatus } from './types'

const TAIA_WORKSPACE_ID = 'ws-default'

const TASK_STATUSES: TaskStatus[] = [
  'IDEA',
  'INBOX',
  'ASSIGNED',
  'IN_PROGRESS',
  'REVIEW',
  'DONE',
  'REJECTED',
]

export function registerTaiaCommands(
  context: vscode.ExtensionContext,
  client: TaiaApiClient,
  tree: TaskTreeProvider,
  refresh: () => Promise<void>,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('taia.setup', async () => {
      await run('setup connection', async () => {
        const config = await promptForConfig()
        if (!config) return
        const settings = vscode.workspace.getConfiguration('taia')
        await Promise.all([
          settings.update('apiUrl', config.apiUrl, vscode.ConfigurationTarget.Global),
          settings.update(
            'workspaceId',
            config.workspaceId ?? '',
            vscode.ConfigurationTarget.Global,
          ),
          settings.update('apiKey', config.apiKey ?? '', vscode.ConfigurationTarget.Global),
          settings.update('agentId', config.agentId, vscode.ConfigurationTarget.Global),
        ])
        await refresh()
        vscode.window.showInformationMessage('TAIA connection settings saved.')
      })
    }),
    vscode.commands.registerCommand('taia.testConnection', async () => {
      await run('test connection', async () => {
        const result = await client.testConnection()
        vscode.window.showInformationMessage(
          `TAIA connected: ${result.taskCount} tasks, ${result.agentCount} agents.`,
        )
      })
    }),
    vscode.commands.registerCommand('taia.selectWorkspace', async () => {
      await run('select workspace', async () => {
        const workspaces = await client.listWorkspaces()
        if (workspaces.length === 0) {
          vscode.window.showWarningMessage('TAIA returned no workspaces to select.')
          return
        }
        const selected = await vscode.window.showQuickPick(
          workspaces.map((workspace) => ({
            label: workspace.name,
            description: workspace.id,
            detail: workspace.description ?? undefined,
            workspace,
          })),
          { title: 'Select TAIA workspace', placeHolder: TAIA_WORKSPACE_ID },
        )
        if (!selected) return
        await vscode.workspace
          .getConfiguration('taia')
          .update('workspaceId', selected.workspace.id, vscode.ConfigurationTarget.Global)
        await refresh()
        vscode.window.showInformationMessage(
          `TAIA workspace selected: ${selected.workspace.name} (${selected.workspace.id})`,
        )
      })
    }),
    vscode.commands.registerCommand('taia.setApiKey', async () => {
      await run('set API key', async () => {
        const current = vscode.workspace.getConfiguration('taia')
        const apiKey = await vscode.window.showInputBox({
          title: 'TAIA API key',
          prompt: 'Optional API key for protected TAIA API/MCP deployments',
          password: true,
          ignoreFocusOut: true,
          value: current.get('apiKey', ''),
        })
        if (apiKey === undefined) return
        await current.update('apiKey', apiKey.trim(), vscode.ConfigurationTarget.Global)
        vscode.window.showInformationMessage(
          apiKey.trim() ? 'TAIA API key saved.' : 'TAIA API key cleared.',
        )
      })
    }),
    vscode.commands.registerCommand('taia.refreshTasks', async () => {
      await run('refresh tasks', refresh)
    }),
    vscode.commands.registerCommand('taia.createTask', async () => {
      const title = await vscode.window.showInputBox({
        title: 'Create TAIA task',
        prompt: 'Task title',
        placeHolder: 'Implement feature...',
      })
      if (!title) return
      await run('create task', async () => {
        const task = await client.createTask(title)
        await refresh()
        vscode.window.showInformationMessage(`Created TAIA task ${task.id}`)
      })
    }),
    vscode.commands.registerCommand('taia.beginTask', async (task: unknown) => {
      const selected = asTaiaTask(task) ?? (await pickTask(tree.getSnapshot(), 'Begin which task?'))
      if (!selected) return
      await run('begin task', async () => {
        await client.moveTask(selected.id, 'IN_PROGRESS')
        await refresh()
        vscode.window.showInformationMessage(`Started ${selected.title}`)
      })
    }),
    vscode.commands.registerCommand('taia.moveTask', async (task: unknown) => {
      const selected = asTaiaTask(task) ?? (await pickTask(tree.getSnapshot(), 'Move which task?'))
      if (!selected) return
      const status = await vscode.window.showQuickPick(TASK_STATUSES, {
        title: 'Move TAIA task',
        placeHolder: selected.status,
      })
      if (!status) return
      await run('move task', async () => {
        await client.moveTask(selected.id, status)
        await refresh()
        vscode.window.showInformationMessage(`Moved ${selected.title} to ${status}`)
      })
    }),
    vscode.commands.registerCommand('taia.assignTask', async (task: unknown) => {
      const selected =
        asTaiaTask(task) ?? (await pickTask(tree.getSnapshot(), 'Assign which task?'))
      if (!selected) return
      const agentId = await vscode.window.showInputBox({
        title: 'Assign TAIA task',
        prompt: 'Agent id',
        value: selected.assigned_to ?? 'system',
      })
      if (!agentId) return
      await run('assign task', async () => {
        await client.assignTask(selected.id, agentId)
        await refresh()
        vscode.window.showInformationMessage(`Assigned ${selected.title} to ${agentId}`)
      })
    }),
  )
}

async function promptForConfig(): Promise<TaiaConfig | undefined> {
  const current = vscode.workspace.getConfiguration('taia')
  const apiUrl = await vscode.window.showInputBox({
    title: 'TAIA API URL',
    prompt: 'Base URL for the TAIA web/API server',
    value: current.get('apiUrl', 'http://localhost:13333'),
    ignoreFocusOut: true,
  })
  if (!apiUrl) return undefined

  const workspaceId = await vscode.window.showInputBox({
    title: 'TAIA workspace id',
    prompt: 'Workspace id used to scope tasks; default is ws-default',
    value: current.get('workspaceId', TAIA_WORKSPACE_ID),
    placeHolder: TAIA_WORKSPACE_ID,
    ignoreFocusOut: true,
  })
  if (workspaceId === undefined) return undefined

  const apiKey = await vscode.window.showInputBox({
    title: 'TAIA API key',
    prompt: 'Optional API key for protected TAIA API/MCP deployments',
    value: current.get('apiKey', ''),
    password: true,
    ignoreFocusOut: true,
  })
  if (apiKey === undefined) return undefined

  const agentId = await vscode.window.showInputBox({
    title: 'TAIA agent id',
    prompt: 'Agent id used by VS Code commands',
    value: current.get('agentId', 'system'),
    ignoreFocusOut: true,
  })
  if (!agentId) return undefined

  return {
    apiUrl: apiUrl.trim().replace(/\/$/, ''),
    workspaceId: workspaceId.trim(),
    apiKey: apiKey.trim(),
    agentId: agentId.trim(),
  }
}

async function pickTask(tasks: TaiaTask[], title: string): Promise<TaiaTask | undefined> {
  const labels = tasks.map((task) => `${task.title} — ${task.status} — ${task.id}`)
  const selected = await vscode.window.showQuickPick(labels, { title })
  if (!selected) return undefined
  const id = selected.split(' — ').at(-1)
  return tasks.find((task) => task.id === id)
}

function asTaiaTask(value: unknown): TaiaTask | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<TaiaTask>
  return typeof candidate.id === 'string' && typeof candidate.title === 'string'
    ? (candidate as TaiaTask)
    : undefined
}

async function run(action: string, callback: () => Promise<void>): Promise<void> {
  try {
    await callback()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    vscode.window.showErrorMessage(`TAIA failed to ${action}: ${message}`)
  }
}
