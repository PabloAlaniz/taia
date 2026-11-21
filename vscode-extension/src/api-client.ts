import * as vscode from 'vscode'
import type { TaiaConfig, TaiaTask, TaiaWorkspace, TaskStatus } from './types'

interface TaskListResponse {
  tasks?: TaiaTask[]
}
interface TaskResponse {
  task?: TaiaTask
}
interface AgentListResponse {
  agents?: { id: string; name?: string }[]
}
interface WorkspaceListResponse {
  workspaces?: TaiaWorkspace[]
}

export class TaiaApiClient {
  constructor(private readonly configProvider: () => TaiaConfig) {}

  async listTasks(): Promise<TaiaTask[]> {
    const config = this.configProvider()
    const url = this.url(
      '/api/tasks',
      config.workspaceId ? { workspace_id: config.workspaceId } : undefined,
    )
    const data = await this.request<TaskListResponse>(url)
    return data.tasks ?? []
  }

  async testConnection(): Promise<{ taskCount: number; agentCount: number }> {
    const [tasks, agentsResponse] = await Promise.all([
      this.listTasks(),
      this.request<AgentListResponse>(this.url('/api/agents')),
    ])
    return { taskCount: tasks.length, agentCount: agentsResponse.agents?.length ?? 0 }
  }

  async listWorkspaces(): Promise<TaiaWorkspace[]> {
    const data = await this.request<WorkspaceListResponse>(this.url('/api/workspaces'))
    return data.workspaces ?? []
  }

  async createTask(title: string, priority = 'MEDIUM'): Promise<TaiaTask> {
    const config = this.configProvider()
    const response = await this.request<TaskResponse>(this.url('/api/tasks'), {
      method: 'POST',
      body: {
        action: 'create',
        task: {
          title,
          priority,
          status: 'INBOX',
          created_by: config.agentId,
          workspace_id: config.workspaceId || undefined,
        },
      },
    })
    return this.requireTask(response, 'create task')
  }

  async moveTask(taskId: string, status: TaskStatus | string): Promise<TaiaTask> {
    const config = this.configProvider()
    const response = await this.request<TaskResponse>(this.url('/api/tasks'), {
      method: 'POST',
      body: { action: 'move', taskId, status, agentId: config.agentId },
    })
    return this.requireTask(response, 'move task')
  }

  async assignTask(taskId: string, agentId: string): Promise<TaiaTask> {
    const response = await this.request<TaskResponse>(this.url('/api/tasks'), {
      method: 'POST',
      body: { action: 'update', taskId, updates: { assigned_to: agentId } },
    })
    return this.requireTask(response, 'assign task')
  }

  private requireTask(response: TaskResponse, action: string): TaiaTask {
    if (!response.task) throw new Error(`TAIA API did not return a task for ${action}`)
    return response.task
  }

  private url(path: string, query?: Record<string, string | undefined>): string {
    const base = this.configProvider().apiUrl.replace(/\/$/, '')
    const url = new URL(`${base}${path}`)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value) url.searchParams.set(key, value)
    }
    return url.toString()
  }

  private async request<T>(
    url: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const config = this.configProvider()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (config.workspaceId) headers['X-Workspace-Id'] = config.workspaceId
    if (config.apiKey) headers['X-API-Key'] = config.apiKey

    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const text = await response.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : {}
    } catch (error) {
      const preview = text.length > 160 ? `${text.slice(0, 160)}…` : text
      throw new Error(`Invalid JSON from TAIA API (${url}): ${preview}`, { cause: error })
    }
    if (!response.ok) {
      const payload =
        data && typeof data === 'object' ? (data as { error?: unknown; message?: unknown }) : {}
      const message =
        (typeof payload.error === 'string' && payload.error) ||
        (typeof payload.message === 'string' && payload.message) ||
        `HTTP ${response.status}`
      throw new Error(`${message} (${url})`)
    }
    return data as T
  }
}

export function readTaiaConfig(): TaiaConfig {
  const config = vscode.workspace.getConfiguration('taia')
  return {
    apiUrl: config.get('apiUrl', 'http://localhost:13333'),
    workspaceId: config.get('workspaceId', ''),
    apiKey: config.get('apiKey', ''),
    agentId: config.get('agentId', 'system'),
  }
}
