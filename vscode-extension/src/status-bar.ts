import * as vscode from 'vscode'
import type { TaiaTask } from './types'
import { readTaiaConfig } from './api-client'

export class TaiaStatusBar {
  private readonly item: vscode.StatusBarItem

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
    this.item.command = 'taia.refreshTasks'
    this.item.show()
  }

  update(tasks: TaiaTask[]): void {
    const config = readTaiaConfig()
    const active = tasks.filter((task) => task.status === 'IN_PROGRESS')
    const current = active.find((task) => task.assigned_to === config.agentId) ?? active[0]
    this.item.text = current
      ? `$(checklist) TAIA ${config.agentId}: ${truncate(current.title, 36)}`
      : `$(checklist) TAIA ${config.agentId}: ${active.length} active`
    this.item.tooltip = current
      ? `Active task: ${current.title}\n${current.id}`
      : 'TAIA: refresh tasks or create a new task'
  }

  dispose(): void {
    this.item.dispose()
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
