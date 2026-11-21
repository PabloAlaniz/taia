'use client'

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useRouter } from 'next/navigation'
import {
  Task,
  Agent,
  TaskPriority,
  Project,
  TaskCostBreakdown,
  Worktree,
  TaskDependencyDetail,
} from '@taia/types'
import { Select, Badge, Input, CostBadge, WorktreeBadge, Button, GitHubIcon } from '../atoms'
import { Dropdown } from '../molecules/dropdown'
import { PRIORITY_COLORS, formatRelativeTime } from '../../lib/utils'
import { formatMinutes, isOverdue, parseTimeInput } from '../../lib/task-utils'
import { useStore } from '../../lib/store'
import { api } from '../../lib/api'
import { shortTaskId } from '@taia/domain/domain/task/task-id'

const TAG_PRESET_COLORS = [
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#84CC16',
  '#10B981',
  '#06B6D4',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#DC2626',
  '#6B7280',
  '#1F2937',
]

export interface TaskSidebarHandle {
  openStatusDropdown: () => void
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface TaskSidebarProps {
  task: Task
  agents: Agent[]
  projects: Project[]
  onStatusChange: (status: string) => Promise<void>
  onAssign: (agentId: string) => Promise<void>
  onUpdateTask: (updates: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
}

const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

export const TaskSidebar = forwardRef<TaskSidebarHandle, TaskSidebarProps>(function TaskSidebar(
  { task, agents, projects, onStatusChange, onAssign, onUpdateTask },
  ref,
) {
  const [estimateInput, setEstimateInput] = useState(
    task.estimated_minutes ? formatMinutes(task.estimated_minutes) : '',
  )
  const [newTag, setNewTag] = useState('')
  const [colorPickerTag, setColorPickerTag] = useState<string | null>(null)
  const [taskCost, setTaskCost] = useState<TaskCostBreakdown | null>(null)
  const [worktree, setWorktree] = useState<Worktree | null>(null)
  const [worktreeLoading, setWorktreeLoading] = useState(false)
  const [blockers, setBlockers] = useState<TaskDependencyDetail[]>([])
  const [dependents, setDependents] = useState<TaskDependencyDetail[]>([])
  const [depSearch, setDepSearch] = useState('')
  const [showDepPicker, setShowDepPicker] = useState(false)
  const router = useRouter()
  const tagColors = useStore((s) => s.tagColors)
  const setTagColor = useStore((s) => s.setTagColor)
  const boardColumns = useStore((s) => s.boardColumns)
  const statusSelectRef = useRef<HTMLSelectElement>(null)
  const assignedAgent = agents.find((a) => a.id === task.assigned_to)
  const assignableAgents = agents.filter((a) => a.type !== 'orchestrator')

  useEffect(() => {
    api.cost
      .forTask(task.id)
      .then((data) => setTaskCost(data.cost))
      .catch(() => setTaskCost(null))
  }, [task.id])

  const allTasks = useStore((s) => s.tasks)

  useEffect(() => {
    api.dependencies
      .list(task.id)
      .then((data) => {
        setBlockers(data.blockers || [])
        setDependents(data.dependents || [])
      })
      .catch(() => {
        setBlockers([])
        setDependents([])
      })
  }, [task.id])

  const handleAddDependency = async (dependsOnTaskId: string) => {
    try {
      await api.dependencies.add(task.id, dependsOnTaskId)
      const data = await api.dependencies.list(task.id)
      setBlockers(data.blockers || [])
      setDependents(data.dependents || [])
    } catch (e) {
      const body = e instanceof Error ? e.message : 'Failed to add dependency'
      console.error('Failed to add dependency:', body)
    }
    setShowDepPicker(false)
    setDepSearch('')
  }

  const handleRemoveDependency = async (dependsOnTaskId: string) => {
    try {
      await api.dependencies.remove(task.id, dependsOnTaskId)
      setBlockers((prev) => prev.filter((b) => b.depends_on_task_id !== dependsOnTaskId))
    } catch (e) {
      console.error('Failed to remove dependency:', e)
    }
  }

  useEffect(() => {
    api.worktrees
      .list(task.id)
      .then((data) => {
        const active = (data.worktrees || []).find(
          (w: Worktree) => !['merged', 'failed', 'cleanup'].includes(w.status),
        )
        setWorktree(active || null)
      })
      .catch(() => setWorktree(null))
  }, [task.id])

  const handleCreateWorktree = async () => {
    setWorktreeLoading(true)
    try {
      const data = await api.worktrees.create({ task_id: task.id })
      if (data.worktree) setWorktree(data.worktree)
    } catch (e) {
      console.error('Failed to create worktree:', e)
    } finally {
      setWorktreeLoading(false)
    }
  }

  const handleWorktreeAction = async (action: string) => {
    if (!worktree) return
    setWorktreeLoading(true)
    try {
      const data = await api.worktrees.action(worktree.id, action)
      if (data.worktree) {
        const isTerminal = ['merged', 'failed', 'cleanup'].includes(data.worktree.status)
        setWorktree(isTerminal ? null : data.worktree)
      }
    } catch (e) {
      console.error('Worktree action failed:', e)
    } finally {
      setWorktreeLoading(false)
    }
  }

  useImperativeHandle(ref, () => ({
    openStatusDropdown: () => {
      statusSelectRef.current?.focus()
      statusSelectRef.current?.click()
    },
  }))

  const handlePriorityChange = async (priority: string) => {
    await onUpdateTask({ priority })
  }

  const handleProjectChange = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    await onUpdateTask({
      project_id: projectId || null,
      project: project?.name || null,
    })
  }

  const handleRepoUrlChange = async (repoUrl: string) => {
    await onUpdateTask({ repo_url: repoUrl || null })
  }

  const handleDueDateChange = async (dateStr: string) => {
    await onUpdateTask({ due_date: dateStr || null })
  }

  const handleEstimateBlur = async () => {
    const minutes = parseTimeInput(estimateInput)
    if (minutes !== null && minutes !== task.estimated_minutes) {
      await onUpdateTask({ estimated_minutes: minutes || null })
    } else if (!estimateInput && task.estimated_minutes) {
      await onUpdateTask({ estimated_minutes: null })
    }
  }

  return (
    <div className="p-4 space-y-6">
      {/* Status */}
      <div>
        <label className="text-xs font-medium text-muted block mb-2">Status (S)</label>
        <Select
          ref={statusSelectRef}
          value={task.status}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          {boardColumns.map((col) => (
            <option key={col.slug} value={col.slug}>
              {col.icon} {col.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Priority */}
      <div>
        <label className="text-xs font-medium text-muted block mb-2">Priority</label>
        <Select value={task.priority} onChange={(e) => handlePriorityChange(e.target.value)}>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority.charAt(0) + priority.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
        <div className="mt-2 flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: PRIORITY_COLORS[task.priority] }}
          />
          <span className="text-xs text-muted">{task.priority}</span>
        </div>
      </div>

      {/* Assigned To */}
      <div>
        <label className="text-xs font-medium text-muted block mb-2">Assigned To</label>
        <Select value={task.assigned_to || ''} onChange={(e) => onAssign(e.target.value)}>
          <option value="">Unassigned</option>
          {assignableAgents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.avatar} {agent.name}
            </option>
          ))}
        </Select>
        {assignedAgent && (
          <div className="mt-2 flex items-center gap-2">
            <span>{assignedAgent.avatar}</span>
            <span className="text-sm">{assignedAgent.name}</span>
            <Badge variant="secondary" size="sm">
              {assignedAgent.status}
            </Badge>
          </div>
        )}
      </div>

      {/* Created By */}
      {task.created_by && (
        <div>
          <label className="text-xs font-medium text-muted block mb-2">Created By</label>
          {(() => {
            const creatorAgent = agents.find((a) => a.id === task.created_by)
            return creatorAgent ? (
              <div className="flex items-center gap-2">
                <span>{creatorAgent.avatar}</span>
                <span className="text-sm">{creatorAgent.name}</span>
              </div>
            ) : (
              <span className="text-sm text-muted">{task.created_by}</span>
            )
          })()}
        </div>
      )}

      {/* Project */}
      <div>
        <label className="text-xs font-medium text-muted block mb-2">Project</label>
        <Select value={task.project_id || ''} onChange={(e) => handleProjectChange(e.target.value)}>
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Repo URL */}
      <div>
        <label className="text-xs font-medium text-muted block mb-2">Repo URL</label>
        <div className="flex items-center gap-1.5">
          <Input
            type="text"
            value={task.repo_url || ''}
            onChange={(e) => handleRepoUrlChange(e.target.value)}
            placeholder={task.primary_repo_url || 'https://github.com/...'}
          />
          {(task.repo_url || task.primary_repo_url) && (
            <a
              href={task.repo_url || task.primary_repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-foreground shrink-0"
              title="Open repository"
            >
              <GitHubIcon size={14} />
            </a>
          )}
        </div>
        {!task.repo_url && task.primary_repo_url && (
          <p className="text-2xs text-muted mt-1">From project primary repo</p>
        )}
      </div>

      {/* Git Worktree */}
      {(task.repo_url || task.primary_repo_url) && (
        <div>
          <label className="text-xs font-medium text-muted block mb-2">Git Worktree</label>
          {!worktree ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateWorktree}
              disabled={worktreeLoading}
            >
              {worktreeLoading ? 'Creating...' : 'Create Worktree'}
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <WorktreeBadge status={worktree.status} />
                <span className="text-xs text-muted truncate" title={worktree.branch_name}>
                  {worktree.branch_name}
                </span>
              </div>
              {worktree.diff_stats && (
                <div className="text-2xs text-muted">
                  {worktree.diff_stats.files_changed} files
                  <span className="text-green-400 ml-1">+{worktree.diff_stats.insertions}</span>
                  <span className="text-red-400 ml-1">-{worktree.diff_stats.deletions}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {worktree.status === 'active' && (
                  <>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => handleWorktreeAction('review')}
                      disabled={worktreeLoading}
                    >
                      Review
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleWorktreeAction('merge')}
                      disabled={worktreeLoading}
                      className="bg-green-500/20 text-green-400 hover:bg-green-500/30"
                    >
                      Merge
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleWorktreeAction('abort')}
                      disabled={worktreeLoading}
                      className="bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    >
                      Abort
                    </Button>
                  </>
                )}
                {worktree.status === 'reviewing' && (
                  <>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleWorktreeAction('merge')}
                      disabled={worktreeLoading}
                      className="bg-green-500/20 text-green-400 hover:bg-green-500/30"
                    >
                      Merge
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleWorktreeAction('abort')}
                      disabled={worktreeLoading}
                      className="bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    >
                      Abort
                    </Button>
                  </>
                )}
              </div>
              {worktree.error_message && (
                <p className="text-2xs text-red-400">{worktree.error_message}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dependencies */}
      <div>
        <label className="text-xs font-medium text-muted block mb-2">Dependencies</label>
        {/* Blockers (this task is blocked by) */}
        {blockers.length > 0 && (
          <div className="mb-2">
            <p className="text-2xs text-muted mb-1">Blocked by:</p>
            <div className="space-y-1">
              {blockers.map((b) => (
                <div key={b.id} className="flex items-center gap-1.5 group">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      b.depends_on_status === 'DONE' || b.depends_on_status === 'REJECTED'
                        ? 'bg-green-400'
                        : 'bg-red-400'
                    }`}
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => router.push(`/task/${b.depends_on_task_id}`)}
                    className="text-foreground hover:text-accent truncate text-left"
                    title={b.depends_on_title}
                  >
                    {b.depends_on_title || shortTaskId(b.depends_on_task_id)}
                  </Button>
                  <Badge variant="secondary" size="sm" className="shrink-0">
                    {b.depends_on_status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleRemoveDependency(b.depends_on_task_id)}
                    className="text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto"
                    title="Remove dependency"
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Dependents (tasks blocked by this one) */}
        {dependents.length > 0 && (
          <div className="mb-2">
            <p className="text-2xs text-muted mb-1">Blocking:</p>
            <div className="space-y-1">
              {dependents.map((d) => (
                <div key={d.id} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => router.push(`/task/${d.task_id}`)}
                    className="text-foreground hover:text-accent truncate text-left"
                    title={d.task_title}
                  >
                    {d.task_title || shortTaskId(d.task_id)}
                  </Button>
                  <Badge variant="secondary" size="sm" className="shrink-0">
                    {d.task_status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Add dependency picker */}
        <div className="relative">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowDepPicker(!showDepPicker)}
            className="text-muted hover:text-foreground"
          >
            + Add blocker
          </Button>
          <Dropdown open={showDepPicker} className="w-64 max-h-48 overflow-hidden">
            <div className="p-2 border-b border-border">
              <Input
                type="text"
                value={depSearch}
                onChange={(e) => setDepSearch(e.target.value)}
                placeholder="Search tasks…"
                className="text-xs"
                autoFocus
              />
            </div>
            <div className="max-h-32 overflow-y-auto">
              {allTasks
                .filter(
                  (t) =>
                    t.id !== task.id &&
                    !blockers.some((b) => b.depends_on_task_id === t.id) &&
                    (depSearch === '' ||
                      t.title.toLowerCase().includes(depSearch.toLowerCase()) ||
                      t.id.toLowerCase().includes(depSearch.toLowerCase())),
                )
                .slice(0, 10)
                .map((t) => (
                  <Button
                    key={t.id}
                    variant="ghost"
                    size="xs"
                    onClick={() => handleAddDependency(t.id)}
                    className="w-full text-left px-3 py-1.5 hover:bg-background flex items-center gap-2 rounded-none"
                  >
                    <span className="text-muted shrink-0">{shortTaskId(t.id)}</span>
                    <span className="truncate">{t.title}</span>
                  </Button>
                ))}
              {allTasks.filter(
                (t) =>
                  t.id !== task.id &&
                  !blockers.some((b) => b.depends_on_task_id === t.id) &&
                  (depSearch === '' ||
                    t.title.toLowerCase().includes(depSearch.toLowerCase()) ||
                    t.id.toLowerCase().includes(depSearch.toLowerCase())),
              ).length === 0 && <p className="px-3 py-2 text-xs text-muted">No matching tasks</p>}
            </div>
          </Dropdown>
        </div>
      </div>

      {/* Confidence */}
      <div>
        <label className="text-xs font-medium text-muted block mb-2">Confidence</label>
        <Badge
          variant={
            task.confidence === 'auto-merge'
              ? 'success'
              : task.confidence === 'notify-only'
                ? 'secondary'
                : 'warning'
          }
          size="sm"
        >
          {task.confidence}
        </Badge>
      </div>

      {/* Tags */}
      <div>
        <label className="text-xs font-medium text-muted block mb-2">Tags</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {task.tags?.map((tag) => (
            <div key={tag} className="relative group">
              <Badge
                variant="default"
                size="sm"
                color={tagColors[tag]}
                className="cursor-pointer"
                onClick={() => setColorPickerTag(colorPickerTag === tag ? null : tag)}
              >
                #{tag}
                <Button
                  variant="ghost"
                  size="xs"
                  className="ml-1 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={async (e) => {
                    e.stopPropagation()
                    const currentTags = task.tags?.filter((t) => t !== tag) || []
                    await onUpdateTask({ tags: currentTags })
                  }}
                  title="Remove tag"
                >
                  ×
                </Button>
              </Badge>
              <Dropdown open={colorPickerTag === tag} className="p-2 w-[156px]">
                <div className="grid grid-cols-5 gap-1">
                  {TAG_PRESET_COLORS.map((color) => (
                    <Button
                      key={color}
                      variant="ghost"
                      size="xs"
                      className="w-6 h-6 p-0 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: color,
                        borderColor: tagColors[tag] === color ? 'white' : 'transparent',
                      }}
                      onClick={() => {
                        setTagColor(tag, color)
                        setColorPickerTag(null)
                      }}
                      title={color}
                    />
                  ))}
                </div>
                {tagColors[tag] && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-2xs text-muted hover:text-foreground mt-1.5 w-full text-center"
                    onClick={() => {
                      setTagColor(tag, null)
                      setColorPickerTag(null)
                    }}
                  >
                    Reset color
                  </Button>
                )}
              </Dropdown>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <Input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && newTag.trim()) {
                const currentTags = task.tags || []
                if (!currentTags.includes(newTag.trim())) {
                  await onUpdateTask({ tags: [...currentTags, newTag.trim()] })
                }
                setNewTag('')
              }
            }}
            placeholder="Add tag…"
            className="text-xs"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Due Date */}
      <div>
        <label className="text-xs font-medium text-muted block mb-2">Due Date</label>
        <Input
          type="date"
          value={task.due_date ? task.due_date.split('T')[0] : ''}
          onChange={(e) => handleDueDateChange(e.target.value)}
        />
        {task.due_date && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm">{formatDate(task.due_date)}</span>
            {task.status !== 'DONE' && isOverdue(task.due_date) && (
              <Badge variant="danger" size="sm">
                Overdue
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Estimate */}
      <div>
        <label className="text-xs font-medium text-muted block mb-2">Estimate</label>
        <Input
          type="text"
          value={estimateInput}
          onChange={(e) => setEstimateInput(e.target.value)}
          onBlur={handleEstimateBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleEstimateBlur()}
          placeholder="e.g., 2h 30m"
        />
        {task.estimated_minutes &&
          task.time_spent_minutes !== undefined &&
          task.time_spent_minutes > 0 && (
            <div className="mt-2 text-xs">
              <div className="flex justify-between text-muted mb-1">
                <span>Progress</span>
                <span>
                  {formatMinutes(task.time_spent_minutes)} / {formatMinutes(task.estimated_minutes)}
                </span>
              </div>
              <div className="w-full h-2 bg-background rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    task.time_spent_minutes > task.estimated_minutes
                      ? 'bg-red-500'
                      : task.time_spent_minutes >= task.estimated_minutes * 0.8
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (task.time_spent_minutes / task.estimated_minutes) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
      </div>

      {/* AI Cost */}
      {taskCost && taskCost.total_tokens > 0 && (
        <div>
          <label className="text-xs font-medium text-muted block mb-2">AI Cost</label>
          <CostBadge costUsd={taskCost.total_cost_usd} tokens={taskCost.total_tokens} />
          {taskCost.session_count > 1 && (
            <p className="text-2xs text-muted mt-1">{taskCost.session_count} sessions</p>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Time Tracking */}
      {task.time_spent_minutes !== undefined && task.time_spent_minutes > 0 && (
        <div>
          <label className="text-xs font-medium text-muted block mb-2">Time Spent</label>
          <p className="text-sm">
            {Math.floor(task.time_spent_minutes / 60)}h {task.time_spent_minutes % 60}m
          </p>
        </div>
      )}

      {/* Timestamps */}
      <div>
        <label className="text-xs font-medium text-muted block mb-2">Created</label>
        <p className="text-sm">{formatRelativeTime(task.created_at)}</p>
      </div>

      <div>
        <label className="text-xs font-medium text-muted block mb-2">Updated</label>
        <p className="text-sm">{formatRelativeTime(task.updated_at)}</p>
      </div>

      {task.started_at && (
        <div>
          <label className="text-xs font-medium text-muted block mb-2">Started</label>
          <p className="text-sm">{formatRelativeTime(task.started_at)}</p>
        </div>
      )}

      {task.completed_at && (
        <div>
          <label className="text-xs font-medium text-muted block mb-2">Completed</label>
          <p className="text-sm">{formatRelativeTime(task.completed_at)}</p>
        </div>
      )}
    </div>
  )
})
