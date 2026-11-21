import * as vscode from 'vscode'
import type { TaiaTask } from './types'
import { TaiaApiClient } from './api-client'

const STATUS_ORDER = [
  'IN_PROGRESS',
  'TODO',
  'ASSIGNED',
  'REVIEW',
  'INBOX',
  'IDEA',
  'DONE',
  'REJECTED',
]

type TaskTreeNode = StatusNode | TaskNode

interface StatusNode {
  kind: 'status'
  status: string
  tasks: TaiaTask[]
}

interface TaskNode {
  kind: 'task'
  task: TaiaTask
}

export class TaskTreeProvider implements vscode.TreeDataProvider<TaskTreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TaskTreeNode | undefined>()
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event
  private tasks: TaiaTask[] = []

  constructor(private readonly client: TaiaApiClient) {}

  async refresh(): Promise<void> {
    this.tasks = await this.client.listTasks()
    this.onDidChangeTreeDataEmitter.fire(undefined)
  }

  getTreeItem(element: TaskTreeNode): vscode.TreeItem {
    if (element.kind === 'status') {
      const item = new vscode.TreeItem(
        `${element.status} (${element.tasks.length})`,
        vscode.TreeItemCollapsibleState.Expanded,
      )
      item.contextValue = 'taiaStatus'
      item.iconPath = new vscode.ThemeIcon('folder')
      return item
    }

    const task = element.task
    const item = new vscode.TreeItem(task.title, vscode.TreeItemCollapsibleState.None)
    item.description = [task.priority, task.assigned_to].filter(Boolean).join(' · ')
    item.tooltip = `${task.id}\n${task.status}${task.project ? ` · ${task.project}` : ''}`
    item.contextValue = 'taiaTask'
    item.iconPath = new vscode.ThemeIcon(
      task.status === 'IN_PROGRESS' ? 'play-circle' : 'circle-outline',
    )
    item.command = { command: 'taia.moveTask', title: 'Move TAIA Task', arguments: [task] }
    return item
  }

  getChildren(element?: TaskTreeNode): TaskTreeNode[] {
    if (element?.kind === 'status') return element.tasks.map((task) => ({ kind: 'task', task }))
    if (element?.kind === 'task') return []

    const groups = new Map<string, TaiaTask[]>()
    for (const task of this.tasks) {
      const existing = groups.get(task.status) ?? []
      existing.push(task)
      groups.set(task.status, existing)
    }

    return Array.from(groups.entries())
      .sort(
        ([left], [right]) => statusIndex(left) - statusIndex(right) || left.localeCompare(right),
      )
      .map(([status, tasks]) => ({ kind: 'status', status, tasks }))
  }

  getSnapshot(): TaiaTask[] {
    return [...this.tasks]
  }
}

function statusIndex(status: string): number {
  const index = STATUS_ORDER.indexOf(status)
  return index === -1 ? STATUS_ORDER.length : index
}
