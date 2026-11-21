// Typed API client for frontend use
// Centralizes all API calls, URLs, headers, and error handling

import type {
  Task,
  TaskTemplate,
  Agent,
  Message,
  Activity,
  Project,
  Repository,
  TaskCostBreakdown,
  AgentCostSummary,
  CostDashboardMetrics,
  Worktree,
  DiffResult,
  TaskDependency,
  TaskDependencyDetail,
  SavedFilter,
  SavedFilterConfig,
  SessionListItem,
  ActiveSession,
  SessionDetail,
  Workspace,
  BoardColumn,
  WorkspacePreset,
} from '@taia/types'

function getActiveWorkspaceId(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('taia-workspace') || 'ws-default'
  }
  return 'ws-default'
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const wsId = getActiveWorkspaceId()
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': wsId,
      ...options?.headers,
    },
    ...options,
  })
  if (res.status === 401 && typeof window !== 'undefined') {
    // The session ended (or the token changed): back to the login screen.
    // A full page load on purpose: the proxy decides what to show next.
    const login = new URL('/login', window.location.origin)
    login.searchParams.set('next', window.location.pathname + window.location.search)
    window.location.href = login.toString()
  }
  return res.json()
}

function post<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function put<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

function del<T>(url: string): Promise<T> {
  return request<T>(url, { method: 'DELETE' })
}

// === Tasks ===

export const api = {
  tasks: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return request<{ tasks: Task[]; total: number }>(`/api/tasks${qs}`)
    },
    get: (taskId: string) => request<{ ok: boolean; task: Task }>(`/api/tasks/${taskId}`),
    create: (task: Partial<Task>) => post<{ task: Task }>('/api/tasks', { action: 'create', task }),
    update: (taskId: string, updates: Partial<Task>) =>
      post<{ task: Task }>('/api/tasks', { action: 'update', taskId, updates }),
    move: (taskId: string, status: string, agentId?: string) =>
      post<{ task: Task }>('/api/tasks', { action: 'move', taskId, status, agentId }),
    delete: (taskId: string) => del<{ ok: boolean; error?: string }>(`/api/tasks/${taskId}`),
    assign: (taskId: string, agentId: string) =>
      post<{ ok: boolean; task: Task; note?: string; error?: string }>('/api/tasks/assign', {
        taskId,
        agentId,
      }),
  },

  dependencies: {
    list: (taskId: string) =>
      request<{
        ok: boolean
        blockers: TaskDependencyDetail[]
        dependents: TaskDependencyDetail[]
      }>(`/api/tasks/${taskId}/dependencies`),
    add: (taskId: string, dependsOnTaskId: string) =>
      post<{ ok: boolean; dependency: TaskDependency }>(`/api/tasks/${taskId}/dependencies`, {
        depends_on_task_id: dependsOnTaskId,
      }),
    remove: (taskId: string, dependsOnTaskId: string) =>
      request<{ ok: boolean; removed: boolean }>(`/api/tasks/${taskId}/dependencies`, {
        method: 'DELETE',
        body: JSON.stringify({ depends_on_task_id: dependsOnTaskId }),
      }),
  },

  agents: {
    list: (detail?: 'full') => {
      const qs = detail ? '?detail=full' : ''
      return request<{ ok: boolean; agents: Agent[]; source: string }>(`/api/agents${qs}`)
    },
    get: (agentId: string) => request<{ ok: boolean; agent: Agent }>(`/api/agents/${agentId}`),
    trigger: (agentId: string) =>
      post<{ ok: boolean; agentId: string; message?: string; error?: string }>(
        `/api/agents/${agentId}/trigger`,
        {},
      ),
  },

  messages: {
    list: (taskId: string) => request<{ messages: Message[] }>(`/api/messages?taskId=${taskId}`),
    create: (taskId: string, fromAgentId: string, content: string) =>
      post<{ message: Message }>('/api/messages', {
        task_id: taskId,
        from_agent_id: fromAgentId,
        content,
      }),
  },

  activities: {
    list: (limit = 30) => request<{ activities: Activity[] }>(`/api/activities?limit=${limit}`),
  },

  columns: {
    list: () => request<{ settings: Record<string, number | null> }>('/api/columns'),
    setWipLimit: (columnName: string, wipLimit: number | null) =>
      put<{ ok: boolean }>(`/api/columns/${columnName}`, { wip_limit: wipLimit }),
  },

  tagColors: {
    list: () => request<{ ok: boolean; colors: Record<string, string> }>('/api/tag-colors'),
    set: (tag: string, color: string | null) =>
      put<{ ok: boolean; colors: Record<string, string> }>('/api/tag-colors', { tag, color }),
  },

  templates: {
    list: () => request<{ ok: boolean; templates: TaskTemplate[] }>('/api/templates'),
    get: (id: string) => request<{ ok: boolean; template: TaskTemplate }>(`/api/templates/${id}`),
    create: (data: Partial<TaskTemplate>) =>
      post<{ ok: boolean; template: TaskTemplate }>('/api/templates', data),
    update: (id: string, data: Partial<TaskTemplate>) =>
      put<{ ok: boolean; template: TaskTemplate }>(`/api/templates/${id}`, data),
    delete: (id: string) => del<{ ok: boolean }>(`/api/templates/${id}`),
  },

  crons: {
    status: (agentId: string) =>
      request<{
        ok: boolean
        agentId: string
        cronId: string
        enabled: boolean
        schedule: string
        nextRun: string | null
        lastRun: string | null
        lastStatus: string | null
      }>(`/api/agents/${agentId}/cron`),
    create: (
      agentId: string,
      data: { schedule: string; enabled?: boolean; timeoutSeconds?: number },
    ) => post<{ ok: boolean; created: boolean }>(`/api/agents/${agentId}/cron`, data),
    update: (
      agentId: string,
      data: { enabled?: boolean; schedule?: string; timeoutSeconds?: number },
    ) =>
      request<{ ok: boolean; agentId: string; cronId: string; enabled: boolean; schedule: string }>(
        `/api/agents/${agentId}/cron`,
        { method: 'PATCH', body: JSON.stringify(data) },
      ),
    remove: (agentId: string) =>
      del<{ ok: boolean; agentId: string; removed: boolean }>(`/api/agents/${agentId}/cron`),
    trigger: (agentId: string) =>
      post<{ ok: boolean; agentId: string; triggered: boolean }>(
        `/api/agents/${agentId}/cron/run`,
        {},
      ),
    history: (agentId: string) =>
      request<{ ok: boolean; agentId: string; runs: unknown[] }>(
        `/api/agents/${agentId}/cron/history`,
      ),
  },

  cost: {
    dashboard: (period?: string) => {
      const qs = period ? `?period=${period}` : ''
      return request<{ ok: boolean; metrics: CostDashboardMetrics }>(`/api/cost/dashboard${qs}`)
    },
    sync: (agentId?: string) =>
      post<{ ok: boolean; synced: number; errors: number }>(
        '/api/cost/sync',
        agentId ? { agentId } : {},
      ),
    forTask: (taskId: string) =>
      request<{ ok: boolean; cost: TaskCostBreakdown }>(`/api/tasks/${taskId}/cost`),
    forAgent: (agentId: string, period?: string) => {
      const qs = period ? `?period=${period}` : ''
      return request<{ ok: boolean; cost: AgentCostSummary }>(`/api/agents/${agentId}/cost${qs}`)
    },
  },

  worktrees: {
    list: (taskId?: string) => {
      const qs = taskId ? `?task_id=${taskId}` : ''
      return request<{ ok: boolean; worktrees: Worktree[] }>(`/api/worktrees${qs}`)
    },
    get: (worktreeId: string) =>
      request<{ ok: boolean; worktree: Worktree }>(`/api/worktrees/${worktreeId}`),
    create: (data: {
      task_id: string
      repository_id?: string
      base_branch?: string
      merge_strategy?: string
    }) => post<{ ok: boolean; worktree: Worktree }>('/api/worktrees', data),
    action: (worktreeId: string, action: string, strategy?: string) =>
      post<{ ok: boolean; worktree: Worktree }>(`/api/worktrees/${worktreeId}`, {
        action,
        strategy,
      }),
    diff: (worktreeId: string) =>
      request<{ ok: boolean; diff: DiffResult }>(`/api/worktrees/${worktreeId}/diff`),
    delete: (worktreeId: string) => del<{ ok: boolean }>(`/api/worktrees/${worktreeId}`),
  },

  filters: {
    list: () => request<{ ok: boolean; filters: SavedFilter[] }>('/api/filters'),
    create: (data: { name: string; icon?: string; filter_config: SavedFilterConfig }) =>
      post<{ ok: boolean; filter: SavedFilter }>('/api/filters', data),
    update: (
      id: string,
      data: Partial<{ name: string; icon: string; filter_config: SavedFilterConfig }>,
    ) => put<{ ok: boolean; filter: SavedFilter }>(`/api/filters/${id}`, data),
    delete: (id: string) => del<{ ok: boolean }>(`/api/filters/${id}`),
  },

  sessions: {
    list: (params?: { agent_id?: string; status?: string; limit?: number }) => {
      const qs = params
        ? '?' +
          new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)]),
          ).toString()
        : ''
      return request<{ ok: boolean; sessions: SessionListItem[] }>(`/api/sessions${qs}`)
    },
    active: () =>
      request<{ ok: boolean; active: ActiveSession[]; timestamp: number }>('/api/sessions/active'),
    history: (
      sessionKey: string,
      params?: { instance?: string; limit?: number; include_tools?: boolean },
    ) => {
      const qs = params
        ? '?' +
          new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)]),
          ).toString()
        : ''
      return request<{ ok: boolean } & SessionDetail>(
        `/api/sessions/${encodeURIComponent(sessionKey)}/history${qs}`,
      )
    },
  },

  workspaces: {
    list: () => request<{ ok: boolean; workspaces: Workspace[] }>('/api/workspaces'),
    get: (id: string) => request<{ ok: boolean; workspace: Workspace }>(`/api/workspaces/${id}`),
    create: (data: {
      name: string
      description?: string
      icon?: string
      color?: string
      preset_id?: string
    }) => post<{ ok: boolean; workspace: Workspace }>('/api/workspaces', data),
    update: (
      id: string,
      data: Partial<{ name: string; description: string; icon: string; color: string }>,
    ) => put<{ ok: boolean; workspace: Workspace }>(`/api/workspaces/${id}`, data),
    delete: (id: string) => del<{ ok: boolean }>(`/api/workspaces/${id}`),
    columns: {
      list: (workspaceId: string) =>
        request<{ ok: boolean; columns: BoardColumn[] }>(`/api/workspaces/${workspaceId}/columns`),
      create: (
        workspaceId: string,
        data: {
          slug: string
          label: string
          icon?: string
          is_done_state?: boolean
          is_initial_state?: boolean
        },
      ) =>
        post<{ ok: boolean; column: BoardColumn }>(`/api/workspaces/${workspaceId}/columns`, data),
      update: (
        workspaceId: string,
        columnId: string,
        data: Partial<{
          label: string
          icon: string
          is_done_state: boolean
          is_initial_state: boolean
        }>,
      ) =>
        put<{ ok: boolean; column: BoardColumn }>(
          `/api/workspaces/${workspaceId}/columns/${columnId}`,
          data,
        ),
      delete: (workspaceId: string, columnId: string) =>
        del<{ ok: boolean }>(`/api/workspaces/${workspaceId}/columns/${columnId}`),
      reorder: (workspaceId: string, order: string[]) =>
        post<{ ok: boolean; columns: BoardColumn[] }>(
          `/api/workspaces/${workspaceId}/columns/reorder`,
          { order },
        ),
    },
    agents: {
      list: (workspaceId: string) =>
        request<{ ok: boolean; agents: Agent[] }>(`/api/workspaces/${workspaceId}/agents`),
      add: (workspaceId: string, agentIds: string[]) =>
        post<{ ok: boolean; agents: Agent[] }>(`/api/workspaces/${workspaceId}/agents`, {
          agent_ids: agentIds,
        }),
      remove: (workspaceId: string, agentId: string) =>
        del<{ ok: boolean }>(`/api/workspaces/${workspaceId}/agents/${agentId}`),
    },
    presets: {
      list: () => request<{ ok: boolean; presets: WorkspacePreset[] }>('/api/workspaces/presets'),
    },
  },

  projects: {
    list: () => request<{ ok: boolean; projects: Project[] }>('/api/projects'),
    get: (id: string) => request<{ ok: boolean; project: Project }>(`/api/projects/${id}`),
    create: (data: { name: string; description?: string }) =>
      post<{ ok: boolean; project: Project }>('/api/projects', data),
    update: (id: string, data: Partial<{ name: string; description: string }>) =>
      put<{ ok: boolean; project: Project }>(`/api/projects/${id}`, data),
    delete: (id: string) => del<{ ok: boolean }>(`/api/projects/${id}`),
    repositories: {
      list: (projectId: string) =>
        request<{ ok: boolean; repositories: Repository[] }>(
          `/api/projects/${projectId}/repositories`,
        ),
      create: (projectId: string, data: { name: string; url: string; is_primary?: boolean }) =>
        post<{ ok: boolean; repository: Repository }>(
          `/api/projects/${projectId}/repositories`,
          data,
        ),
      update: (
        projectId: string,
        repoId: string,
        data: Partial<{ name: string; url: string; is_primary: boolean }>,
      ) =>
        put<{ ok: boolean; repository: Repository }>(
          `/api/projects/${projectId}/repositories/${repoId}`,
          data,
        ),
      delete: (projectId: string, repoId: string) =>
        del<{ ok: boolean }>(`/api/projects/${projectId}/repositories/${repoId}`),
    },
  },

  // === Onboarding ===

  onboarding: {
    status: () =>
      request<{
        ok: boolean
        completed: boolean
        provider: string
        runtime_configured: boolean
      }>('/api/onboarding/status'),
    complete: () => post<{ ok: boolean }>('/api/onboarding/complete', {}),
    generateSetup: (need: string) =>
      post<{ ok: boolean; setup: unknown }>('/api/onboarding/setup', { need }),
    applySetup: (setup: unknown, useDefaultWorkspace = true) =>
      post<{ ok: boolean; result: unknown }>('/api/onboarding/apply', {
        setup,
        useDefaultWorkspace,
      }),
    enrichmentStatus: () =>
      request<{
        ok: boolean
        status: { startedAt: string; agents: Record<string, string> } | null
      }>('/api/onboarding/enrichment-status'),
  },
}
