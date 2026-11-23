'use client'

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'
import {
  Task,
  Agent,
  TaskPriority,
  Project,
  TaskCostBreakdown,
  TaskDependencyDetail,
} from '@taia/types'
import {
  Select,
  Badge,
  Input,
  CostBadge,
  Button,
  GitHubIcon,
  ParticipantMark,
  Kbd,
  PriorityMark,
} from '../atoms'
import { Dropdown } from '../molecules/dropdown'
import { formatMinutes, isOverdue, parseTimeInput } from '../../lib/task-utils'
import { useStore } from '../../lib/store'
import { api } from '../../lib/api'
import { WorktreePanel } from './worktree-panel'
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

/** Parses API timestamps, which may come without a zone (then they are UTC). */
function parseTimestamp(iso: string): Date {
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T')
  const zoned = normalized.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(normalized)
  return new Date(zoned ? normalized : `${normalized}Z`)
}

const CONFIDENCE_KEYS = {
  'auto-merge': 'confidenceAutoMerge',
  'notify-only': 'confidenceNotifyOnly',
  'needs-approval': 'confidenceNeedsApproval',
} as const

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
  const [blockers, setBlockers] = useState<TaskDependencyDetail[]>([])
  const [dependents, setDependents] = useState<TaskDependencyDetail[]>([])
  const [depSearch, setDepSearch] = useState('')
  const [showDepPicker, setShowDepPicker] = useState(false)
  const [depError, setDepError] = useState<string | null>(null)
  const t = useTranslations('taskSidebarUi')
  const tp = useTranslations('taskPage')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const ago = (iso: string) => format.relativeTime(parseTimestamp(iso), now)
  const router = useRouter()
  const tagColors = useStore((s) => s.tagColors)
  const setTagColor = useStore((s) => s.setTagColor)
  const boardColumns = useStore((s) => s.boardColumns)
  const statusSelectRef = useRef<HTMLSelectElement>(null)
  const assignedAgent = agents.find((a) => a.id === task.assigned_to)
  const assignableAgents = agents.filter((a) => a.type !== 'orchestrator')
  const columnLabel = (slug?: string) => boardColumns.find((c) => c.slug === slug)?.label ?? slug

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
    setDepError(null)
    try {
      await api.dependencies.add(task.id, dependsOnTaskId)
      const data = await api.dependencies.list(task.id)
      setBlockers(data.blockers || [])
      setDependents(data.dependents || [])
    } catch (e) {
      console.error('Failed to add dependency:', e instanceof Error ? e.message : e)
      setDepError(t('addBlockerFailed'))
    }
    setShowDepPicker(false)
    setDepSearch('')
  }

  const handleRemoveDependency = async (dependsOnTaskId: string) => {
    setDepError(null)
    try {
      await api.dependencies.remove(task.id, dependsOnTaskId)
      setBlockers((prev) => prev.filter((b) => b.depends_on_task_id !== dependsOnTaskId))
    } catch (e) {
      console.error('Failed to remove dependency:', e)
      setDepError(t('removeBlockerFailed'))
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
    // Fields as ruled rows, like the boxes of a flight strip.
    <div className="px-4 divide-y divide-border [&>*]:py-3.5 [&_label]:uppercase [&_label]:tracking-[0.08em] [&_label]:font-semibold [&_h3]:uppercase [&_h3]:tracking-[0.08em] [&_h3]:font-semibold">
      {/* Status */}
      <div>
        <label htmlFor="task-status" className="text-xs font-medium text-muted block mb-2">
          {t('status')} <Kbd title={t('shortcut', { key: 'S' })}>S</Kbd>
        </label>
        <Select
          id="task-status"
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
        <label htmlFor="task-priority" className="text-xs font-medium text-muted block mb-2">
          {t('priority')}
        </label>
        <div className="flex items-center gap-2">
          <PriorityMark priority={task.priority} withLabel={false} className="shrink-0" />
          <Select
            id="task-priority"
            value={task.priority}
            onChange={(e) => handlePriorityChange(e.target.value)}
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {tp('priorityName', { priority })}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Assigned To */}
      <div>
        <label htmlFor="task-assignee" className="text-xs font-medium text-muted block mb-2">
          {t('assignedTo')}
        </label>
        <Select
          id="task-assignee"
          value={task.assigned_to || ''}
          onChange={(e) => onAssign(e.target.value)}
        >
          <option value="">{t('unassigned')}</option>
          {assignableAgents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </Select>
        {assignedAgent && (
          <div className="mt-2 flex items-center gap-2">
            <ParticipantMark agent={assignedAgent} />
            <span className="text-sm">{assignedAgent.name}</span>
            <Badge variant="secondary" size="sm">
              {t('agentStatus', { status: assignedAgent.status })}
            </Badge>
          </div>
        )}
      </div>

      {/* Created By */}
      {task.created_by && (
        <div>
          <h3 className="text-xs text-muted mb-2">{t('createdBy')}</h3>
          {(() => {
            const creatorAgent = agents.find((a) => a.id === task.created_by)
            return creatorAgent ? (
              <div className="flex items-center gap-2">
                <ParticipantMark agent={creatorAgent} />
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
        <label htmlFor="task-project" className="text-xs font-medium text-muted block mb-2">
          {t('project')}
        </label>
        <Select
          id="task-project"
          value={task.project_id || ''}
          onChange={(e) => handleProjectChange(e.target.value)}
        >
          <option value="">{t('noProject')}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Repo URL */}
      <div>
        <label htmlFor="task-repo-url" className="text-xs font-medium text-muted block mb-2">
          {t('repoUrl')}
        </label>
        <div className="flex items-center gap-1.5">
          <Input
            id="task-repo-url"
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
              title={t('openRepo')}
              aria-label={t('openRepo')}
            >
              <GitHubIcon size={14} aria-hidden />
            </a>
          )}
        </div>
        {!task.repo_url && task.primary_repo_url && (
          <p className="text-2xs text-muted mt-1">{t('repoFromProject')}</p>
        )}
      </div>

      {(task.repo_url || task.primary_repo_url) && <WorktreePanel taskId={task.id} />}

      {/* Dependencies */}
      <div>
        <h3 className="text-xs text-muted mb-2">{t('dependencies')}</h3>
        {/* Blockers (this task is blocked by) */}
        {blockers.length > 0 && (
          <div className="mb-2">
            <p className="text-2xs text-muted mb-1">{t('blockedBy')}</p>
            <div className="space-y-1">
              {blockers.map((b) => {
                const resolved =
                  b.depends_on_status === 'DONE' || b.depends_on_status === 'REJECTED'
                const title = b.depends_on_title || shortTaskId(b.depends_on_task_id)
                return (
                  <div key={b.id} className="flex items-center gap-1.5 group">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${resolved ? 'bg-ok' : 'bg-alert'}`}
                      role="img"
                      aria-label={resolved ? t('resolved') : t('pending')}
                    />
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => router.push(`/task/${b.depends_on_task_id}`)}
                      className="text-foreground hover:text-accent truncate text-left"
                      title={b.depends_on_title}
                    >
                      {title}
                    </Button>
                    <Badge variant="secondary" size="sm" className="shrink-0">
                      {columnLabel(b.depends_on_status)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleRemoveDependency(b.depends_on_task_id)}
                      className="text-muted hover:text-alert opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0 ml-auto"
                      aria-label={t('removeBlocker', { title })}
                      title={t('removeBlocker', { title })}
                    >
                      <X size={12} aria-hidden />
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {/* Dependents (tasks blocked by this one) */}
        {dependents.length > 0 && (
          <div className="mb-2">
            <p className="text-2xs text-muted mb-1">{t('blocking')}</p>
            <div className="space-y-1">
              {dependents.map((d) => (
                <div key={d.id} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-person-ink shrink-0" aria-hidden />
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
                    {columnLabel(d.task_status)}
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
            aria-expanded={showDepPicker}
          >
            <Plus size={12} aria-hidden className="mr-1" />
            {t('addBlocker')}
          </Button>
          <Dropdown open={showDepPicker} className="w-64 max-h-48 overflow-hidden">
            <div className="p-2 border-b border-border">
              <Input
                type="text"
                value={depSearch}
                onChange={(e) => setDepSearch(e.target.value)}
                placeholder={t('searchTasks')}
                aria-label={t('searchTasks')}
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
              ).length === 0 && (
                <p className="px-3 py-2 text-xs text-muted">
                  {depSearch ? t('noMatches', { query: depSearch }) : t('noOtherTasks')}
                </p>
              )}
            </div>
          </Dropdown>
        </div>
        {depError && (
          <p role="alert" className="text-2xs text-alert mt-1">
            {depError}
          </p>
        )}
      </div>

      {/* Confidence */}
      <div>
        <p className="text-xs font-medium text-muted mb-2">{t('confidence')}</p>
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
          {task.confidence in CONFIDENCE_KEYS
            ? t(CONFIDENCE_KEYS[task.confidence as keyof typeof CONFIDENCE_KEYS])
            : task.confidence}
        </Badge>
      </div>

      {/* Tags */}
      <div>
        <p className="text-xs font-medium text-muted mb-2">{t('tags')}</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {task.tags?.map((tag) => (
            <div key={tag} className="relative group">
              <Badge
                variant="default"
                size="sm"
                color={tagColors[tag]}
                className="cursor-pointer"
                onClick={() => setColorPickerTag(colorPickerTag === tag ? null : tag)}
                title={t('tagColorFor', { tag })}
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
                  aria-label={t('removeTag', { tag })}
                  title={t('removeTag', { tag })}
                >
                  <X size={10} aria-hidden />
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
                      title={t('tagColor', { color })}
                      aria-label={t('tagColor', { color })}
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
                    {t('resetColor')}
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
                  await onUpdateTask({
                    tags: [...currentTags, newTag.trim()],
                  })
                }
                setNewTag('')
              }
            }}
            placeholder={t('addTag')}
            aria-label={t('addTag')}
            className="text-xs"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Due Date */}
      <div>
        <label htmlFor="task-due-date" className="text-xs font-medium text-muted block mb-2">
          {t('dueDate')}
        </label>
        <Input
          id="task-due-date"
          type="date"
          value={task.due_date ? task.due_date.split('T')[0] : ''}
          onChange={(e) => handleDueDateChange(e.target.value)}
        />
        {task.due_date && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm">
              {format.dateTime(new Date(task.due_date), {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            {task.status !== 'DONE' && isOverdue(task.due_date) && (
              <Badge variant="danger" size="sm">
                {t('overdue')}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Estimate */}
      <div>
        <label htmlFor="task-estimate" className="text-xs font-medium text-muted block mb-2">
          {t('estimate')}
        </label>
        <Input
          id="task-estimate"
          type="text"
          value={estimateInput}
          onChange={(e) => setEstimateInput(e.target.value)}
          onBlur={handleEstimateBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleEstimateBlur()}
          placeholder={t('estimatePlaceholder')}
        />
        {task.estimated_minutes &&
          task.time_spent_minutes !== undefined &&
          task.time_spent_minutes > 0 && (
            <div className="mt-2 text-xs">
              <div className="flex justify-between text-muted mb-1">
                <span>{t('timeUsed')}</span>
                <span>
                  {t('timeOfEstimate', {
                    spent: formatMinutes(task.time_spent_minutes),
                    estimate: formatMinutes(task.estimated_minutes),
                  })}
                </span>
              </div>
              <div className="w-full h-2 bg-background rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    task.time_spent_minutes > task.estimated_minutes
                      ? 'bg-alert'
                      : task.time_spent_minutes >= task.estimated_minutes * 0.8
                        ? 'bg-person-ink'
                        : 'bg-ok'
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
          <p className="text-xs font-medium text-muted mb-2">{t('aiCost')}</p>
          <CostBadge costUsd={taskCost.total_cost_usd} tokens={taskCost.total_tokens} />
          {taskCost.session_count > 1 && (
            <p className="text-2xs text-muted mt-1">
              {t('sessions', { count: taskCost.session_count })}
            </p>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Time Tracking */}
      {task.time_spent_minutes !== undefined && task.time_spent_minutes > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-2">{t('timeSpent')}</p>
          <p className="text-sm">
            {t('hoursMinutes', {
              hours: Math.floor(task.time_spent_minutes / 60),
              minutes: task.time_spent_minutes % 60,
            })}
          </p>
        </div>
      )}

      {/* Timestamps */}
      <div>
        <p className="text-xs font-medium text-muted mb-2">{t('created')}</p>
        <p className="text-sm">{ago(task.created_at)}</p>
      </div>

      <div>
        <p className="text-xs font-medium text-muted mb-2">{t('updated')}</p>
        <p className="text-sm">{ago(task.updated_at)}</p>
      </div>

      {task.started_at && (
        <div>
          <p className="text-xs font-medium text-muted mb-2">{t('started')}</p>
          <p className="text-sm">{ago(task.started_at)}</p>
        </div>
      )}

      {task.completed_at && (
        <div>
          <p className="text-xs font-medium text-muted mb-2">{t('completed')}</p>
          <p className="text-sm">{ago(task.completed_at)}</p>
        </div>
      )}
    </div>
  )
})
