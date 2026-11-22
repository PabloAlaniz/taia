'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Task, Agent, Message, Subtask, Project, TaskTrajectory } from '@taia/types'
import { TaskHeader } from './task-header'
import { TaskContent, TaskContentHandle } from './task-content'
import { TaskSidebar, TaskSidebarHandle } from './task-sidebar'

interface TaskPageProps {
  task: Task
  agents: Agent[]
  projects: Project[]
  messages: Message[]
  trajectories: TaskTrajectory[]
  subtasks: Subtask[]
  onBack: () => void
  onUpdateTask: (updates: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
  onStatusChange: (status: string) => Promise<void>
  onAssign: (agentId: string) => Promise<void>
  onSendMessage: (content: string) => Promise<void>
  onAddSubtask: (title: string) => Promise<void>
  onToggleSubtask: (id: string, completed: boolean) => Promise<void>
  onUpdateSubtask: (id: string, title: string) => Promise<void>
  onDeleteSubtask: (id: string) => Promise<void>
}

export function TaskPage({
  task,
  agents,
  projects,
  messages,
  trajectories,
  subtasks,
  onBack,
  onUpdateTask,
  onStatusChange,
  onAssign,
  onSendMessage,
  onAddSubtask,
  onToggleSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
}: TaskPageProps) {
  const contentRef = useRef<TaskContentHandle>(null)
  const sidebarRef = useRef<TaskSidebarHandle>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      switch (e.key.toLowerCase()) {
        case 'e':
          e.preventDefault()
          contentRef.current?.focusTitle()
          break
        case 'd':
          e.preventDefault()
          contentRef.current?.focusDescription()
          break
        case 's':
          e.preventDefault()
          sidebarRef.current?.openStatusDropdown()
          break
        case 'escape':
          e.preventDefault()
          onBack()
          break
      }
    },
    [onBack],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex flex-col h-screen bg-background">
      <TaskHeader task={task} onBack={onBack} />

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <TaskContent
            ref={contentRef}
            task={task}
            agents={agents}
            messages={messages}
            trajectories={trajectories}
            subtasks={subtasks}
            onUpdateTask={onUpdateTask}
            onSendMessage={onSendMessage}
            onAddSubtask={onAddSubtask}
            onToggleSubtask={onToggleSubtask}
            onUpdateSubtask={onUpdateSubtask}
            onDeleteSubtask={onDeleteSubtask}
          />
        </div>

        {/* Sidebar - stacks below on mobile, side panel on desktop */}
        <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border bg-strip overflow-y-auto shrink-0">
          <TaskSidebar
            ref={sidebarRef}
            task={task}
            agents={agents}
            projects={projects}
            onStatusChange={onStatusChange}
            onAssign={onAssign}
            onUpdateTask={onUpdateTask}
          />
        </aside>
      </div>
    </div>
  )
}
