// API request/response types

import type { Task, Agent, Activity } from './domain'

// Standard API response wrapper
export interface ApiResponse<T = unknown> {
  ok: boolean
  error?: string
  code?: string
  details?: Record<string, string[]>
  data?: T
}

// Task API
export interface CreateTaskRequest {
  title: string
  description?: string
  status?: string
  priority?: string
  confidence?: string
  project?: string
  tags?: string[]
  assigned_to?: string
  due_date?: string
  estimated_minutes?: number
}

export interface UpdateTaskRequest {
  title?: string
  description?: string
  status?: string
  priority?: string
  confidence?: string
  assigned_to?: string | null
  project?: string | null
  tags?: string[]
  due_date?: string | null
  estimated_minutes?: number | null
  time_spent_minutes?: number | null
}

export interface TaskListResponse {
  tasks: Task[]
  total: number
}

// Message API
export interface CreateMessageRequest {
  task_id?: string
  taskId?: string
  from_agent_id?: string
  fromAgentId?: string
  content: string
}

// Agent API
export interface AgentListResponse {
  agents: Agent[]
}

// Activity API
export interface ActivityListResponse {
  activities: Activity[]
}

// Subtask API
export interface CreateSubtaskRequest {
  title: string
}

// Notification API
export interface NotificationActionRequest {
  action: 'deliver' | 'fail' | 'retry' | 'create'
  notificationId?: string
  mentioned_agent_id?: string
  content?: string
  from_agent_id?: string
  task_id?: string
  attempts?: number
  nextRetryAt?: string
}
