'use client'

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { TaskStatus, SavedFilterConfig } from '@taia/types'
import { useStore } from '../lib/store'
import { useRealtimeUpdates } from '../lib/use-websocket'
import { useBoardSignals } from '../lib/use-board-signals'
import { useRuntimeStatus } from '../lib/use-runtime-status'
import { useHideChrome } from '../lib/chrome'
import { useKeyboardShortcuts } from '@/lib/use-keyboard-shortcuts'
import { useFontScale } from '@/lib/use-font-scale'
import { applyAllFilters } from '../lib/filter-utils'
import { CreateWorkspaceModal } from '../components/organisms/create-workspace-modal'
import { OnboardingShell } from '../components/templates/onboarding-shell'
import { StepConnection } from '../components/organisms/onboarding/step-connection'
import { StepProject } from '../components/organisms/onboarding/step-project'
import { Button, Kbd, MateMark } from '../components/atoms'

// Molecules
import { WipLimitModal } from '../components/molecules/wip-limit-modal'
import { Toast } from '../components/molecules/toast'
import { ActiveFiltersPanel } from '../components/molecules/active-filters-panel'
import { EmptyState } from '../components/molecules/empty-state'

// Organisms
import { BoardHeader, type BoardView } from '../components/organisms/board-header'
import { BoardToolbar } from '../components/organisms/board-toolbar'
import { SearchBar } from '../components/organisms/search-bar'
import { KanbanBoard } from '../components/organisms/kanban-board'
import { AgentPanel } from '../components/organisms/agent-panel'
import { ActivityFeed } from '../components/organisms/activity-feed'
import { AddTaskModal } from '../components/organisms/add-task-modal'
import { useIsClient } from '@/lib/use-is-client'
import { PlanningWizard } from '../components/organisms/planning-wizard'

export default function BoardPage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense>
      <Home />
    </Suspense>
  )
}

function Home() {
  const t = useTranslations('home')
  const to = useTranslations('onboarding')
  const tos = useTranslations('onboardingShell')
  const te = useTranslations('emptyBoard')
  const {
    agents,
    tasks,
    activities,
    projects,
    columnSettings,
    activeFilterConfig,
    setFilterField,
    clearFilters,
    loadSavedFilter,
    selectedProjectId,
    setSelectedProject,
    groupBy,
    setGroupBy,
    moveTask,
    addTask,
    assignTask,
    setColumnWipLimit,
    refresh,
    loading,
    savedFilters,
    activeFilterId,
    setActiveFilter,
    createSavedFilter,
    deleteSavedFilter,
    boardColumns,
    tagColors,
  } = useStore()

  // Apply unified filter config (memoized)
  const filteredTasks = useMemo(
    () => applyAllFilters(tasks, activeFilterConfig, boardColumns, selectedProjectId),
    [tasks, activeFilterConfig, boardColumns, selectedProjectId],
  )

  const signals = useBoardSignals(tasks)
  const runtime = useRuntimeStatus()
  const searchParams = useSearchParams()
  const urlView: BoardView = searchParams.get('view') === 'waiting' ? 'waiting' : 'all'
  const [view, setView] = useState<BoardView>(urlView)
  // The top bar's counter links here; follow it when already on the board.
  const [seenUrlView, setSeenUrlView] = useState(urlView)
  if (urlView !== seenUrlView) {
    setSeenUrlView(urlView)
    setView(urlView)
  }
  const visibleTasks = useMemo(
    () => (view === 'waiting' ? filteredTasks.filter((t) => signals.waiting[t.id]) : filteredTasks),
    [view, filteredTasks, signals.waiting],
  )
  const changeView = (next: BoardView) => {
    setView(next)
    const url = new URL(window.location.href)
    if (next === 'waiting') url.searchParams.set('view', 'waiting')
    else url.searchParams.delete('view')
    window.history.replaceState(null, '', url)
  }
  const currentUserId = useStore((s) => s.currentUserId)
  const decide = useCallback(
    (approvalId: string, decision: 'approved' | 'rejected') =>
      signals.decide(approvalId, decision, currentUserId ?? undefined),
    [signals, currentUserId],
  )

  // Compute available tags from all tasks
  const availableTags = useMemo(
    () => Array.from(new Set(tasks.flatMap((t) => t.tags || []))).sort(),
    [tasks],
  )

  // Agent selection syncs with activeFilterConfig.assigned_to
  const selectedAgentId = activeFilterConfig.assigned_to || null

  const handleSelectAgent = (id: string) => {
    if (selectedAgentId === id) {
      setFilterField('assigned_to', undefined)
    } else {
      setFilterField('assigned_to', id)
      setFilterField('unassigned', undefined)
    }
  }

  // Handle saved filter selection
  const handleSelectFilter = (filterId: string | null) => {
    if (!filterId) {
      clearFilters()
      setActiveFilter(null)
    } else {
      const filter = savedFilters.find((f) => f.id === filterId)
      if (filter) {
        loadSavedFilter(filter)
        setActiveFilter(filterId)
      }
    }
  }

  // Handle removing a single filter chip
  const handleRemoveFilter = (key: keyof SavedFilterConfig, tagToRemove?: string) => {
    if (key === 'tags' && tagToRemove) {
      const currentTags = activeFilterConfig.tags || []
      const newTags = currentTags.filter((t) => t !== tagToRemove)
      setFilterField('tags', newTags.length > 0 ? newTags : undefined)
    } else {
      setFilterField(key, undefined)
    }
  }

  const [showModal, setShowModal] = useState(false)
  const [showPlanWizard, setShowPlanWizard] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)
  // The activity rail only opens by default where the bays still fit beside it.
  const [showActivity, setShowActivity] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1700,
  )
  const [showMobileAgents, setShowMobileAgents] = useState(false)
  const [wipModalStatus, setWipModalStatus] = useState<string | null>(null)
  const [wipWarning, setWipWarning] = useState<string | null>(null)

  // Onboarding state: null = loading, false = not done, true = done
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null)
  const [showConnectionStep, setShowConnectionStep] = useState(false)
  const [showFirstWorkspace, setShowFirstWorkspace] = useState(false)
  // Onboarding: the first project (who the work is for) comes before the
  // first workspace (how the work flows).
  const [projectStepDone, setProjectStepDone] = useState(false)
  const [runtimeConfigured, setRuntimeConfigured] = useState(false)
  // Onboarding is its own full-screen moment: no top bar until it ends.
  useHideChrome(onboardingCompleted === false)

  // Prevent hydration mismatch from DragDropContext (generates different IDs on server vs client)
  const mounted = useIsClient()
  const router = useRouter()

  // Font scaling
  const fontScale = useFontScale()

  // WebSocket realtime updates
  const handleTaskUpdate = useCallback(() => refresh(), [refresh])
  const handleActivityUpdate = useCallback(() => refresh(), [refresh])

  const { isConnected } = useRealtimeUpdates({
    onTaskUpdate: handleTaskUpdate,
    onActivityUpdate: handleActivityUpdate,
    enabled: onboardingCompleted === true,
  })

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNewTask: () => setShowModal(true),
    onSearch: () => setShowSearch(true),
    onRefresh: refresh,
    onEscape: () => {
      setShowSearch(false)
      setShowModal(false)
    },
  })

  // Sync filter from URL on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const filterParam = params.get('filter')
      if (filterParam) {
        const filter = savedFilters.find((f) => f.id === filterParam)
        if (filter) loadSavedFilter(filter)
        setActiveFilter(filterParam)
      }
    }
  }, [setActiveFilter, loadSavedFilter, savedFilters])

  // Check onboarding status + initial load
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/onboarding/status', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        setOnboardingCompleted(data.completed === true)
        setRuntimeConfigured(data.runtime_configured === true)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return
        setOnboardingCompleted(true) // fail open
      })
    return () => controller.abort()
  }, [])

  // Initial load + polling fallback (reduced when WS is active)
  useEffect(() => {
    if (onboardingCompleted !== true) return
    refresh()
    // Poll less frequently when WS is connected (safety net only)
    const pollInterval = isConnected ? 120000 : 30000
    const interval = setInterval(refresh, pollInterval)
    return () => clearInterval(interval)
  }, [refresh, onboardingCompleted, isConnected])

  // Handlers
  const handleMoveTask = async (taskId: string, newStatus: TaskStatus) => {
    const wipLimit = columnSettings[newStatus]
    if (wipLimit != null && wipLimit > 0) {
      const currentCount = tasks.filter((t) => t.status === newStatus).length
      if (currentCount >= wipLimit) {
        const col = boardColumns.find((c) => c.slug === newStatus)
        setWipWarning(t('wipExceeded', { column: col?.label || newStatus }))
        setTimeout(() => setWipWarning(null), 3000)
      }
    }
    try {
      await moveTask(taskId, newStatus)
    } catch {
      setWipWarning(t('moveBlocked'))
      setTimeout(() => setWipWarning(null), 4000)
    }
  }

  const handleAssign = async (taskId: string, agentId: string) => {
    setAssigning(taskId)
    const result = await assignTask(taskId, agentId)
    setAssigning(null)
    if (!result.ok) {
      setWipWarning(t('assignFailed', { error: result.error ?? '' }))
      setTimeout(() => setWipWarning(null), 4000)
    }
  }

  if (!mounted) return null

  // Loading onboarding status
  if (onboardingCompleted === null) {
    return (
      <div className="h-full min-h-[50vh] flex items-center justify-center">
        <MateMark size={40} title="TAIA" className="text-muted motion-safe:animate-pulse" />
      </div>
    )
  }

  // First time: choose a runtime (or standalone)
  if (onboardingCompleted === false && !runtimeConfigured && !showFirstWorkspace) {
    if (!showConnectionStep) {
      return (
        <OnboardingShell>
          <h1 className="text-3xl font-semibold leading-tight text-balance">
            {tos('welcomeTitle')}
          </h1>
          <p className="text-muted mt-3 max-w-prose">{to('welcomeText')}</p>
          <Button
            variant="primary"
            size="lg"
            className="mt-8"
            onClick={() => setShowConnectionStep(true)}
          >
            {tos('start')}
          </Button>
        </OnboardingShell>
      )
    }

    return (
      <OnboardingShell step="runtime">
        <StepConnection
          onConnected={() => {
            setShowConnectionStep(false)
            setShowFirstWorkspace(true)
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="mt-4"
          onClick={() => {
            setShowConnectionStep(false)
            setShowFirstWorkspace(true)
          }}
        >
          {to('skipConnection')}
        </Button>
      </OnboardingShell>
    )
  }

  // First time: the first project (optional)
  if (
    onboardingCompleted === false &&
    (showFirstWorkspace || runtimeConfigured) &&
    !projectStepDone
  ) {
    return (
      <OnboardingShell step="project">
        <StepProject onDone={() => setProjectStepDone(true)} />
      </OnboardingShell>
    )
  }

  // First time: create first workspace (full-screen modal)
  if (onboardingCompleted === false && (showFirstWorkspace || runtimeConfigured)) {
    return (
      <CreateWorkspaceModal
        open={true}
        fullScreen
        onClose={async () => {
          // Mark onboarding as complete
          await fetch('/api/onboarding/complete', { method: 'POST' })
          setOnboardingCompleted(true)
          refresh()
        }}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <BoardHeader
        taskCount={tasks.length}
        agentCount={agents.filter((a) => a.type !== 'human').length}
        liveAgents={runtime.configured ? signals.liveAgents : null}
        waitingCount={signals.waitingCount}
        view={view}
        onViewChange={changeView}
        isConnected={isConnected}
        loading={loading}
        showActivity={showActivity}
        showAgents={showMobileAgents}
        onToggleActivity={() => setShowActivity(!showActivity)}
        onToggleAgents={() => setShowMobileAgents(!showMobileAgents)}
        onAddTask={() => setShowModal(true)}
        onPlanWizard={() => setShowPlanWizard(true)}
      />

      <BoardToolbar
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProject}
        agents={agents}
        tasks={tasks}
        activeFilterConfig={activeFilterConfig}
        tagColors={tagColors}
        availableTags={availableTags}
        onSetFilterField={setFilterField}
        onClearFilters={clearFilters}
        savedFilters={savedFilters}
        activeFilterId={activeFilterId}
        onSelectFilter={handleSelectFilter}
        onCreateFilter={createSavedFilter}
        onDeleteFilter={deleteSavedFilter}
        onSearch={() => setShowSearch(true)}
        fontScale={fontScale}
        hint={t.rich('shortcutHint', { key: (chunks) => <Kbd>{chunks}</Kbd> })}
      />

      {tasks.length === 0 && !loading && (
        <div className="mx-4 md:mx-6 mb-3 rounded-md border border-border bg-card">
          <EmptyState
            title={te('title')}
            description={te('body')}
            action={
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="md" onClick={() => setShowModal(true)}>
                  {te('newTask')}
                </Button>
                <a
                  href="https://pabloalaniz.github.io/taia/guias/cliente-mcp/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-border bg-background px-3 py-1.5 text-sm font-semibold no-underline text-foreground hover:bg-strip"
                >
                  {te('mcp')}
                </a>
              </div>
            }
          />
        </div>
      )}

      {/* Active filters panel (MercadoLibre-style chips) */}
      <ActiveFiltersPanel
        config={activeFilterConfig}
        agents={agents}
        tagColors={tagColors}
        onRemoveFilter={handleRemoveFilter}
        onClearAll={clearFilters}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Agent Sidebar */}
        <AgentPanel
          agents={agents}
          tasks={tasks}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
          mobileOpen={showMobileAgents}
          onMobileClose={() => setShowMobileAgents(false)}
        />

        {/* Kanban Board */}
        <KanbanBoard
          tasks={visibleTasks}
          agents={agents}
          projects={projects}
          columns={boardColumns}
          groupBy={groupBy}
          selectedTaskId={null}
          assigning={assigning}
          columnSettings={columnSettings}
          onMoveTask={handleMoveTask}
          onSelectTask={() => {}}
          onAssign={handleAssign}
          onEditWipLimit={setWipModalStatus}
          costs={signals.costs}
          waiting={signals.waiting}
          running={signals.running}
          onDecide={decide}
        />

        {/* Right Sidebar: Activity Feed - hidden on mobile/tablet */}
        {showActivity && (
          <aside className="hidden xl:flex w-72 bg-card border-l border-border flex-col overflow-hidden shrink-0">
            <ActivityFeed activities={activities} agents={agents} tasks={tasks} />
          </aside>
        )}
      </div>

      {/* Add Task Modal */}
      <AddTaskModal
        open={showModal}
        onClose={() => setShowModal(false)}
        projects={projects}
        onAdd={addTask}
      />

      {/* Planning Wizard */}
      <PlanningWizard
        open={showPlanWizard}
        onClose={() => setShowPlanWizard(false)}
        onCreateTasks={async (tasks) => {
          const res = await fetch('/api/planning', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks }),
          })
          if (res.ok) refresh()
        }}
      />

      {/* Search Modal */}
      {showSearch && (
        <SearchBar
          tasks={tasks}
          agents={agents}
          onSelectTask={(id) => {
            setShowSearch(false)
            router.push(`/task/${id}`)
          }}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* WIP Limit Modal */}
      <WipLimitModal
        open={wipModalStatus !== null}
        status={wipModalStatus}
        columnLabel={
          wipModalStatus
            ? (() => {
                const col = boardColumns.find((c) => c.slug === wipModalStatus)
                return col ? col.label : wipModalStatus
              })()
            : undefined
        }
        currentLimit={wipModalStatus ? (columnSettings[wipModalStatus] ?? null) : null}
        onClose={() => setWipModalStatus(null)}
        onSave={(status, limit) => setColumnWipLimit(status, limit)}
      />

      {/* WIP Warning Toast */}
      {wipWarning && <Toast variant="warning">{wipWarning}</Toast>}
    </div>
  )
}
