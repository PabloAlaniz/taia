'use client'

import { useState, forwardRef, useImperativeHandle, type ReactNode } from 'react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { Bot, User } from 'lucide-react'
import { Task, Agent, Message, Subtask, TaskTrajectory } from '@taia/types'
import { Button, Input, Textarea } from '../atoms'
import { Card, SubtaskList } from '../molecules'
import { useCurrentUserAgent } from '@/lib/store-selectors'

/** Parses API timestamps, which may come without a zone (then they are UTC). */
function parseTimestamp(iso: string): Date {
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T')
  const zoned = normalized.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(normalized)
  return new Date(zoned ? normalized : `${normalized}Z`)
}

export interface TaskContentHandle {
  focusTitle: () => void
  focusDescription: () => void
}

interface TaskContentProps {
  task: Task
  agents: Agent[]
  messages: Message[]
  trajectories: TaskTrajectory[]
  subtasks: Subtask[]
  onUpdateTask: (updates: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
  onSendMessage: (content: string) => Promise<void>
  onAddSubtask: (title: string) => Promise<void>
  onToggleSubtask: (id: string, completed: boolean) => Promise<void>
  onUpdateSubtask: (id: string, title: string) => Promise<void>
  onDeleteSubtask: (id: string) => Promise<void>
}

export const TaskContent = forwardRef<TaskContentHandle, TaskContentProps>(function TaskContent(
  {
    task,
    agents,
    messages,
    trajectories,
    subtasks,
    onUpdateTask,
    onSendMessage,
    onAddSubtask,
    onToggleSubtask,
    onUpdateSubtask,
    onDeleteSubtask,
  },
  ref,
) {
  const t = useTranslations('taskPage')
  const tc = useTranslations('common')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const currentUser = useCurrentUserAgent()
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const [newMessage, setNewMessage] = useState('')

  useImperativeHandle(ref, () => ({
    focusTitle: () => setEditingTitle(true),
    focusDescription: () => setEditingDescription(true),
  }))

  const getAgentInfo = (agentId: string): { name: string; avatar: ReactNode } => {
    const agent = agents.find((a) => a.id === agentId)
    return {
      name: agent?.name ?? agentId,
      avatar: agent?.avatar || <Bot size={14} aria-hidden />,
    }
  }

  const ago = (iso: string) => format.relativeTime(parseTimestamp(iso), now)

  const handleSaveTitle = async () => {
    if (title.trim() && title !== task.title) {
      await onUpdateTask({ title: title.trim() })
    }
    setEditingTitle(false)
  }

  const handleSaveDescription = async () => {
    if (description !== task.description) {
      await onUpdateTask({ description: description.trim() || null })
    }
    setEditingDescription(false)
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return
    await onSendMessage(newMessage.trim())
    setNewMessage('')
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Title */}
      <div className="mb-6">
        {editingTitle ? (
          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle()
                if (e.key === 'Escape') {
                  setTitle(task.title)
                  setEditingTitle(false)
                }
              }}
              autoFocus
              className="text-xl font-semibold"
            />
            <Button variant="primary" size="sm" onClick={handleSaveTitle}>
              {tc('save')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTitle(task.title)
                setEditingTitle(false)
              }}
            >
              {tc('cancel')}
            </Button>
          </div>
        ) : (
          <h1
            className="text-2xl font-semibold cursor-pointer hover:bg-background/50 rounded-sm px-2 py-1 -mx-2"
            onClick={() => setEditingTitle(true)}
            title={t('editTitle')}
          >
            {task.title}
          </h1>
        )}
      </div>

      {/* Description */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-muted mb-2">{t('description')}</h2>
        {editingDescription ? (
          <div className="space-y-2">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDescription(task.description || '')
                  setEditingDescription(false)
                }
              }}
              autoFocus
              rows={6}
              placeholder={t('descriptionPlaceholder')}
            />
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={handleSaveDescription}>
                {tc('save')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDescription(task.description || '')
                  setEditingDescription(false)
                }}
              >
                {tc('cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="min-h-[100px] p-4 bg-background rounded-lg cursor-pointer hover:bg-background/70 transition-colors"
            onClick={() => setEditingDescription(true)}
            title={t('editDescription')}
          >
            {task.description ? (
              <p className="text-sm whitespace-pre-wrap">{task.description}</p>
            ) : (
              <p className="text-sm text-muted">{t('descriptionEmpty')}</p>
            )}
          </div>
        )}
      </div>

      {/* Subtasks */}
      <div className="mb-8">
        <SubtaskList
          subtasks={subtasks}
          onAdd={onAddSubtask}
          onToggle={onToggleSubtask}
          onUpdate={onUpdateSubtask}
          onDelete={onDeleteSubtask}
        />
      </div>

      {/* Agent Trajectory */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-muted mb-4">{t('trajectory')}</h2>
        {trajectories.length === 0 ? (
          <p className="text-sm text-muted text-center py-6 bg-background rounded-lg">
            {t('trajectoryEmpty')}
          </p>
        ) : (
          <div className="space-y-3">
            {trajectories.map((item) => {
              const agent = getAgentInfo(item.actor)
              return (
                <Card key={item.id} padding="sm" className="bg-background">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span>{agent.avatar}</span>
                      <span className="font-medium text-sm">{agent.name}</span>
                    </div>
                    <span className="text-xs text-muted">{ago(item.created_at)}</span>
                  </div>
                  <p className="text-sm font-medium whitespace-pre-wrap">{item.decision}</p>
                  {item.reasoning && (
                    <p className="text-xs text-muted mt-2 whitespace-pre-wrap">{item.reasoning}</p>
                  )}
                  {item.outcome && (
                    <p className="text-xs mt-2">
                      <span className="text-muted">{t('outcome')} </span>
                      {item.outcome}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Comments */}
      <div>
        <h2 className="text-sm font-medium text-muted mb-4">{t('comments')}</h2>

        {messages.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">{t('commentsEmpty')}</p>
        ) : (
          <div className="space-y-4 mb-6">
            {messages.map((msg) => {
              const agent = getAgentInfo(msg.from_agent_id)
              return (
                <div key={msg.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center shrink-0">
                    {agent.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{agent.name}</span>
                      <span className="text-xs text-muted">{ago(msg.created_at)}</span>
                    </div>
                    <Card padding="sm" className="bg-background">
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </Card>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* New Comment Input */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center shrink-0">
            {currentUser?.avatar || <User size={14} aria-hidden />}
          </div>
          <div className="flex-1 flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder={t('commentPlaceholder')}
              aria-label={t('commentPlaceholder')}
              className="flex-1"
            />
            <Button variant="primary" onClick={handleSendMessage} disabled={!newMessage.trim()}>
              {t('sendComment')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
})
