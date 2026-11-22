'use client'

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { Task, Message, Agent } from '@taia/types'
import { PRIORITY_COLORS } from '../../lib/utils'
import { useStore } from '../../lib/store'
import { Button, Badge, Input, ParticipantMark } from '../atoms'
import { Card } from '../molecules'

interface TaskDetailProps {
  task: Task
  messages: Message[]
  agents: Agent[]
  currentUserId?: string | null
  onClose: () => void
  onSendMessage: (taskId: string, fromAgentId: string, content: string) => void
}

export function TaskDetail({
  task,
  messages,
  agents,
  currentUserId,
  onClose,
  onSendMessage,
}: TaskDetailProps) {
  const t = useTranslations('taskDetail')
  const tc = useTranslations('common')
  const tp = useTranslations('taskPage')
  const format = useFormatter()
  const boardColumns = useStore((s) => s.boardColumns)
  const statusLabel = boardColumns.find((c) => c.slug === task.status)?.label ?? task.status
  const [newMessage, setNewMessage] = useState('')
  const assignedAgent = agents.find((a) => a.id === task.assigned_to)

  const getAgentInfo = (agentId: string): { name: string; type?: string } => {
    const agent = agents.find((a) => a.id === agentId)
    return { name: agent?.name ?? agentId, type: agent?.type }
  }

  const handleSend = () => {
    if (!newMessage.trim()) return
    onSendMessage(task.id, currentUserId || 'main', newMessage.trim())
    setNewMessage('')
  }

  const priorityColor = PRIORITY_COLORS[task.priority]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <code className="text-2xs text-muted block mb-1">{tp('taskId', { id: task.id })}</code>
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: priorityColor }}
              role="img"
              aria-label={tp('priorityAria', { priority: task.priority })}
            />
            <h3 className="text-base font-medium truncate">{task.title}</h3>
          </div>
          {task.project && (
            <Badge variant="accent" size="sm" className="mt-2">
              {task.project}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="xs" onClick={onClose} aria-label={tp('close')}>
          <X size={14} aria-hidden />
        </Button>
      </div>

      {/* Task Info */}
      <div className="p-4 border-b border-border max-h-48 overflow-y-auto">
        {task.description && (
          <p className="text-sm text-muted mb-3 whitespace-pre-wrap">{task.description}</p>
        )}
        <div className="flex gap-4 text-xs flex-wrap">
          <div>
            <span className="text-muted">{t('status')} </span>
            <span>{statusLabel}</span>
          </div>
          {assignedAgent && (
            <div>
              <span className="text-muted">{t('assigned')} </span>
              <span>{assignedAgent.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <h4 className="text-xs text-muted mb-3">{t('comments')}</h4>
        {messages.length === 0 ? (
          <p className="text-muted text-xs text-center">{t('noComments')}</p>
        ) : (
          messages.map((msg) => {
            const agent = getAgentInfo(msg.from_agent_id)
            return (
              <div key={msg.id} className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <ParticipantMark agent={agent} />
                  <span className="font-medium text-sm">{agent.name}</span>
                  <span className="text-2xs text-muted">
                    {format.dateTime(new Date(msg.created_at), {
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                <Card padding="sm" className="ml-7 max-h-72 overflow-y-auto">
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                </Card>
              </div>
            )
          })
        )}
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={t('addComment')}
            aria-label={t('addComment')}
          />
          <Button variant="primary" onClick={handleSend} disabled={!newMessage.trim()}>
            {tc('send')}
          </Button>
        </div>
      </div>
    </div>
  )
}
