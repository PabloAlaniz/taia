'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useStore } from '../../../lib/store'
import { TaskPage } from '../../../components/organisms/task-page'
import { Subtask, TaskTrajectory } from '@taia/types'
import { useResource } from '../../../lib/use-resource'
import { Button } from '../../../components/atoms'

/** GETs `url` and returns `body[field]`, or [] when the API reports `ok: false`. */
async function loadList<T>(url: string, field: string): Promise<T[]> {
  const res = await fetch(url)
  const data = (await res.json()) as { ok?: boolean } & Record<string, unknown>
  return data.ok ? ((data[field] as T[]) ?? []) : []
}

export default function TaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const taskId = params.id as string

  const {
    tasks,
    agents,
    projects,
    refresh,
    selectedTaskMessages,
    fetchMessages,
    sendMessage,
    moveTask,
    assignTask,
    currentUserId,
  } = useStore()

  const task = tasks.find((t) => t.id === taskId)
  const workspaceId = task?.workspace_id

  const subtasksUrl = `/api/tasks/${taskId}/subtasks`
  const { data: subtasks = [], reload: reloadSubtasks } = useResource(
    taskId ? subtasksUrl : null,
    () => loadList<Subtask>(subtasksUrl, 'subtasks'),
  )
  const trajectoriesUrl = workspaceId
    ? `/api/tasks/${taskId}/trajectories?workspace_id=${encodeURIComponent(workspaceId)}`
    : null
  const { data: trajectories = [] } = useResource(trajectoriesUrl, () =>
    loadList<TaskTrajectory>(trajectoriesUrl!, 'trajectories'),
  )

  useEffect(() => {
    // Load data if not already loaded
    if (tasks.length === 0) {
      refresh()
    }
  }, [tasks.length, refresh])

  useEffect(() => {
    // Fetch messages and subtasks for this task
    if (taskId) {
      fetchMessages(taskId)
    }
  }, [taskId, fetchMessages])

  const handleBack = () => {
    router.push('/')
  }

  const handleUpdateTask = async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (data.ok) {
        refresh()
      }
      return data
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    await moveTask(taskId, newStatus)
  }

  const handleAssign = async (agentId: string) => {
    await assignTask(taskId, agentId)
  }

  const handleSendMessage = async (content: string) => {
    await sendMessage(taskId, currentUserId || 'main', content)
  }

  const handleAddSubtask = async (title: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = await res.json()
      if (data.ok) {
        reloadSubtasks()
      }
    } catch (error) {
      console.error('Failed to add subtask:', error)
    }
  }

  const handleToggleSubtask = async (id: string, completed: boolean) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      })
      const data = await res.json()
      if (data.ok) {
        reloadSubtasks()
      }
    } catch (error) {
      console.error('Failed to toggle subtask:', error)
    }
  }

  const handleUpdateSubtask = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = await res.json()
      if (data.ok) {
        reloadSubtasks()
      }
    } catch (error) {
      console.error('Failed to update subtask:', error)
    }
  }

  const handleDeleteSubtask = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.ok) {
        reloadSubtasks()
      }
    } catch (error) {
      console.error('Failed to delete subtask:', error)
    }
  }

  if (!task) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-muted mb-4">Task not found</p>
          <Button variant="ghost" onClick={handleBack} className="text-accent hover:underline">
            Back to Board
          </Button>
        </div>
      </div>
    )
  }

  return (
    <TaskPage
      task={task}
      agents={agents}
      projects={projects}
      messages={selectedTaskMessages}
      trajectories={trajectories}
      subtasks={subtasks}
      onBack={handleBack}
      onUpdateTask={handleUpdateTask}
      onStatusChange={handleStatusChange}
      onAssign={handleAssign}
      onSendMessage={handleSendMessage}
      onAddSubtask={handleAddSubtask}
      onToggleSubtask={handleToggleSubtask}
      onUpdateSubtask={handleUpdateSubtask}
      onDeleteSubtask={handleDeleteSubtask}
    />
  )
}
