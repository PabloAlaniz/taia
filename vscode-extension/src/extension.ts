import * as vscode from 'vscode'
import { TaiaApiClient, readTaiaConfig } from './api-client'
import { registerTaiaCommands } from './commands'
import { TaiaStatusBar } from './status-bar'
import { TaskTreeProvider } from './task-tree'

export function activate(context: vscode.ExtensionContext): void {
  const client = new TaiaApiClient(readTaiaConfig)
  const tree = new TaskTreeProvider(client)
  const statusBar = new TaiaStatusBar()

  const refresh = async () => {
    await tree.refresh()
    statusBar.update(tree.getSnapshot())
  }

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('taia.taskTree', tree),
    statusBar,
  )

  registerTaiaCommands(context, client, tree, refresh)
  refresh().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    vscode.window.showErrorMessage(`TAIA initial refresh failed: ${message}`)
  })
}

export function deactivate(): void {}
