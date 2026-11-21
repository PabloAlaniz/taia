export type TaskStatus =
  | 'TODO'
  | 'IDEA'
  | 'INBOX'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'REVIEW'
  | 'DONE'
  | 'REJECTED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export interface TaiaTask {
  id: string
  title: string
  description?: string
  status: TaskStatus | string
  priority: TaskPriority
  assigned_to?: string | null
  project?: string | null
  workspace_id?: string | null
  tags?: string[]
  updated_at?: string
}

export interface TaiaConfig {
  apiUrl: string
  workspaceId?: string
  apiKey?: string
  agentId: string
}

export interface TaiaWorkspace {
  id: string
  name: string
  description?: string | null
}
