'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Task, Agent } from '@taia/types'
import { cn, PRIORITY_COLORS } from '../../lib/utils'
import { Badge, Code, Input, Backdrop } from '../atoms'
import { Card } from '../molecules'
import { shortTaskId } from '@taia/domain/domain/task/task-id'

interface SearchBarProps {
  tasks: Task[]
  agents: Agent[]
  onSelectTask: (taskId: string) => void
  onClose: () => void
}

export function SearchBar({ tasks, agents, onSelectTask, onClose }: SearchBarProps) {
  const t = useTranslations('search')
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filteredTasks = query.trim()
    ? tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(query.toLowerCase()) ||
          t.id.toLowerCase().includes(query.toLowerCase()) ||
          t.project?.toLowerCase().includes(query.toLowerCase()) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(query.toLowerCase())),
      )
    : []

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filteredTasks.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredTasks[selectedIndex]) {
          onSelectTask(filteredTasks[selectedIndex].id)
          onClose()
        }
        break
      case 'Escape':
        onClose()
        break
    }
  }

  const getAgentName = (agentId?: string) => {
    if (!agentId) return ''
    const agent = agents.find((a) => a.id === agentId)
    return agent ? `${agent.avatar} ${agent.name}` : ''
  }

  return (
    <Backdrop align="top" onClick={onClose} role="presentation">
      <Card
        role="combobox"
        aria-expanded={filteredTasks.length > 0}
        aria-haspopup="listbox"
        aria-label={t('label')}
        padding="none"
        className="w-full max-w-[500px] mx-4 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-border">
          <Input
            ref={inputRef}
            type="text"
            role="searchbox"
            aria-label={t('ariaLabel')}
            aria-autocomplete="list"
            aria-controls="search-results"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('placeholder')}
            className="w-full bg-transparent border-none text-foreground text-base focus:outline-hidden placeholder:text-muted"
          />
        </div>

        {query.trim() && (
          <div id="search-results" role="listbox" className="max-h-80 overflow-y-auto">
            {filteredTasks.length === 0 ? (
              <div
                className="p-4 text-center text-muted text-sm"
                role="option"
                aria-selected={false}
              >
                {t('noResults')}
              </div>
            ) : (
              filteredTasks.slice(0, 10).map((task, index) => (
                <div
                  key={task.id}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => {
                    onSelectTask(task.id)
                    onClose()
                  }}
                  className={cn(
                    'px-3 py-2 cursor-pointer border-l-[3px] transition-colors',
                    index === selectedIndex ? 'bg-accent/20' : 'hover:bg-card',
                  )}
                  style={{ borderLeftColor: PRIORITY_COLORS[task.priority] }}
                >
                  <div className="flex items-center gap-2">
                    <Code size="sm">{shortTaskId(task.id)}</Code>
                    <Badge variant="default" size="xs">
                      {task.status}
                    </Badge>
                  </div>
                  <div className="text-sm mt-1">{task.title}</div>
                  <div className="text-xs text-muted mt-1 flex gap-2">
                    {task.project && <span>📁 {task.project}</span>}
                    {getAgentName(task.assigned_to) && (
                      <span>{getAgentName(task.assigned_to)}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="p-2 border-t border-border text-2xs text-muted flex gap-4">
          <span>{t('navigate')}</span>
          <span>{t('select')}</span>
          <span>{t('close')}</span>
        </div>
      </Card>
    </Backdrop>
  )
}
