'use client'

import { useState, useRef, useEffect } from 'react'
import { Subtask } from '@taia/types'
import { Button, Checkbox, IconButton, Input } from '../atoms'
import { cn } from '../../lib/utils'

interface SubtaskListProps {
  subtasks: Subtask[]
  onAdd: (title: string) => Promise<void>
  onToggle: (id: string, completed: boolean) => Promise<void>
  onUpdate: (id: string, title: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder?: (order: string[]) => Promise<void>
}

export function SubtaskList({ subtasks, onAdd, onToggle, onUpdate, onDelete }: SubtaskListProps) {
  const [newTitle, setNewTitle] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const completed = subtasks.filter((s) => s.completed).length
  const total = subtasks.length

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAdding])

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    await onAdd(newTitle.trim())
    setNewTitle('')
    setIsAdding(false)
  }

  const handleStartEdit = (subtask: Subtask) => {
    setEditingId(subtask.id)
    setEditingTitle(subtask.title)
  }

  const handleSaveEdit = async () => {
    if (editingId && editingTitle.trim()) {
      await onUpdate(editingId, editingTitle.trim())
    }
    setEditingId(null)
    setEditingTitle('')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  return (
    <div className="space-y-3">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted flex items-center gap-2">
          <span>Subtasks</span>
          {total > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-background rounded-sm">
              {completed}/{total}
            </span>
          )}
        </h3>
        {total > 0 && (
          <div className="w-24 h-1.5 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${(completed / total) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Subtask list */}
      {subtasks.length > 0 && (
        <ul className="space-y-1">
          {subtasks.map((subtask) => (
            <li
              key={subtask.id}
              className={cn(
                'flex items-center gap-2 group p-2 rounded-sm hover:bg-background/50 transition-colors',
                subtask.completed && 'opacity-60',
              )}
            >
              <Checkbox
                checked={subtask.completed}
                onChange={(e) => onToggle(subtask.id, e.target.checked)}
              />

              {editingId === subtask.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit()
                      if (e.key === 'Escape') handleCancelEdit()
                    }}
                    autoFocus
                    className="flex-1 text-sm"
                  />
                  <Button variant="ghost" size="xs" onClick={handleSaveEdit}>
                    Save
                  </Button>
                  <Button variant="ghost" size="xs" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <span
                    className={cn(
                      'flex-1 text-sm cursor-pointer',
                      subtask.completed && 'line-through',
                    )}
                    onClick={() => handleStartEdit(subtask)}
                  >
                    {subtask.title}
                  </span>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    onClick={() => onDelete(subtask.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-opacity"
                    aria-label="Delete subtask"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </IconButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add new subtask */}
      {isAdding ? (
        <div className="flex items-center gap-2 p-2">
          <Checkbox disabled className="opacity-50 cursor-default" />
          <Input
            ref={inputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') {
                setIsAdding(false)
                setNewTitle('')
              }
            }}
            placeholder="Enter subtask title…"
            className="flex-1 text-sm"
          />
          <Button variant="primary" size="xs" onClick={handleAdd}>
            Add
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setIsAdding(false)
              setNewTitle('')
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 text-sm text-muted hover:text-foreground p-2 w-full rounded-sm hover:bg-background/50"
        >
          <span className="w-4 h-4 flex items-center justify-center text-lg">+</span>
          Add subtask
        </Button>
      )}
    </div>
  )
}
