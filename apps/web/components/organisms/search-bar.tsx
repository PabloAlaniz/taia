'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Brain,
  CalendarDays,
  Columns3,
  FolderGit2,
  GitBranch,
  History,
  LayoutDashboard,
  Plug,
  ScrollText,
  Settings,
  SlidersHorizontal,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Task, Agent } from '@taia/types'
import { cn } from '../../lib/utils'
import { useStore } from '../../lib/store'
import { useWaiting } from '../../lib/use-shell-signals'
import {
  PALETTE_PAGES,
  buildPaletteGroups,
  paletteHref,
  type PageEntry,
  type PaletteGroupKey,
  type PaletteItem,
} from '../../lib/command-palette'
import { Badge, Code, Input, Backdrop, PriorityMark, Kbd, Strip } from '../atoms'
import { Card } from '../molecules'
import { shortTaskId } from '@taia/domain/domain/task/task-id'

interface SearchBarProps {
  tasks: Task[]
  agents: Agent[]
  onSelectTask: (taskId: string) => void
  onClose: () => void
}

const PAGE_ICONS: Record<string, LucideIcon> = {
  '/': Columns3,
  '/sessions': History,
  '/projects': FolderGit2,
  '/squad': Users,
  '/dashboard': LayoutDashboard,
  '/calendar': CalendarDays,
  '/settings': Settings,
  '/settings/runtime': Plug,
  '/settings/models': Brain,
  '/settings/worktrees': GitBranch,
  '/settings/profile': UserRound,
  '/settings/projects': FolderGit2,
  '/settings/general': SlidersHorizontal,
  '/settings/audit': ScrollText,
}

/**
 * The "/" palette: tasks first, then pages, the team and projects. One list
 * for the keyboard across every section; the input owns focus and points at
 * the active option with aria-activedescendant.
 */
export function SearchBar({ tasks, agents, onSelectTask, onClose }: SearchBarProps) {
  const t = useTranslations('search')
  const tn = useTranslations('nav')
  const tp = useTranslations('pageTitles')
  const ts = useTranslations('settingsPage')
  const tk = useTranslations('squad.kind')
  const router = useRouter()
  const columns = useStore((s) => s.boardColumns)
  const projects = useStore((s) => s.projects)
  const waiting = useWaiting()
  const columnLabel = (slug: string) => columns.find((c) => c.slug === slug)?.label ?? slug
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const baseId = useId()
  const listboxId = `${baseId}-results`

  // Focus the input on open; give focus back to where it was on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  const pages: PageEntry[] = useMemo(() => {
    const ns = { nav: tn, pageTitles: tp, settingsPage: ts }
    const settings = tn('settings')
    return PALETTE_PAGES.map((p) => ({
      href: p.href,
      label: ns[p.ns](p.key),
      parent: p.inSettings ? settings : undefined,
    }))
  }, [tn, tp, ts])

  const waitingIds = useMemo(() => Object.keys(waiting), [waiting])
  const groups = useMemo(
    () =>
      buildPaletteGroups({
        query,
        tasks,
        members: agents,
        projects,
        pages,
        waitingTaskIds: waitingIds,
      }),
    [query, tasks, agents, projects, pages, waitingIds],
  )
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])
  // Where each section starts in the flat list: one index space for the keyboard.
  const offsets = useMemo(
    () => groups.map((_, g) => groups.slice(0, g).reduce((n, x) => n + x.items.length, 0)),
    [groups],
  )
  const active = flat.length === 0 ? -1 : Math.min(activeIndex, flat.length - 1)
  const optionId = (index: number) => `${baseId}-opt-${index}`
  const activeId = active >= 0 ? optionId(active) : undefined

  // Keep the active option in view as the keyboard walks the list.
  useEffect(() => {
    if (!activeId) return
    document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])

  const choose = (item: PaletteItem) => {
    if (item.type === 'task') {
      onSelectTask(item.task.id)
      onClose()
      return
    }
    const href = paletteHref(item)
    onClose()
    if (href) router.push(href)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const last = flat.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(active >= last ? 0 : active + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(active <= 0 ? last : active - 1)
        break
      case 'Home':
        if (flat.length === 0) break
        e.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        if (flat.length === 0) break
        e.preventDefault()
        setActiveIndex(last)
        break
      case 'Enter':
        e.preventDefault()
        if (active >= 0) choose(flat[active])
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
      case 'Tab':
        // The input is the dialog's only stop; Tab stays inside it.
        e.preventDefault()
        break
    }
  }

  const agentById = (id?: string) => (id ? agents.find((a) => a.id === id) : undefined)
  const groupLabel: Record<PaletteGroupKey, string> = {
    waiting: t('groups.waiting'),
    tasks: t('groups.tasks'),
    pages: t('groups.pages'),
    team: t('groups.team'),
    projects: t('groups.projects'),
  }

  const hasQuery = query.trim().length > 0

  return (
    <Backdrop align="top" onClick={onClose} role="presentation">
      <Card
        role="dialog"
        aria-modal="true"
        aria-label={t('label')}
        padding="none"
        className="w-full max-w-[540px] mx-4 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-border">
          <Input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={t('ariaLabel')}
            aria-autocomplete="list"
            aria-expanded={flat.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={activeId}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('placeholder')}
            className="w-full bg-transparent border-none text-foreground text-base focus:outline-hidden placeholder:text-muted"
          />
        </div>

        <div
          id={listboxId}
          role="listbox"
          aria-label={t('label')}
          className={cn('max-h-[min(60vh,26rem)] overflow-y-auto', flat.length > 0 && 'p-2')}
        >
          {groups.map((group, g) => (
            <div
              key={group.key}
              role="group"
              aria-label={groupLabel[group.key]}
              className="pb-2 last:pb-0"
            >
              <div
                aria-hidden="true"
                className="px-1 pt-1 pb-1.5 text-xxs font-semibold uppercase tracking-[0.08em] text-muted"
              >
                {group.key === 'waiting' ? (
                  <span className="rounded-[2px] bg-person text-on-person font-bold tracking-[0.12em] px-1.5 py-0.5">
                    {groupLabel.waiting}
                  </span>
                ) : (
                  groupLabel[group.key]
                )}
              </div>
              <div className="flex flex-col gap-1">
                {group.items.map((item, n) => {
                  const i = offsets[g] + n
                  return (
                    <PaletteOption
                      key={item.key}
                      id={optionId(i)}
                      active={i === active}
                      item={item}
                      onHover={() => setActiveIndex(i)}
                      onChoose={() => choose(item)}
                      columnLabel={columnLabel}
                      agentById={agentById}
                      kindLabel={(person) => (person ? tk('person') : tk('agent'))}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {hasQuery && flat.length === 0 && (
          <p className="p-4 text-center text-muted text-sm">{t('noResults')}</p>
        )}
        <p role="status" className="sr-only">
          {hasQuery ? t('resultsCount', { count: flat.length }) : ''}
        </p>

        <div className="px-3 py-2 border-t border-border text-xs text-muted flex gap-4">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            {t('navigate')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            {t('select')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            {t('close')}
          </span>
        </div>
      </Card>
    </Backdrop>
  )
}

function PaletteOption({
  id,
  active,
  item,
  onHover,
  onChoose,
  columnLabel,
  agentById,
  kindLabel,
}: {
  id: string
  active: boolean
  item: PaletteItem
  onHover: () => void
  onChoose: () => void
  columnLabel: (slug: string) => string
  agentById: (id?: string) => Agent | undefined
  kindLabel: (person: boolean) => string
}) {
  const kind =
    item.type === 'member'
      ? item.member.type === 'human'
        ? 'person'
        : 'agent'
      : item.type === 'task'
        ? (() => {
            const assignee = agentById(item.task.assigned_to)
            if (!assignee) return 'none'
            return assignee.type === 'human' ? 'person' : 'agent'
          })()
        : 'none'

  return (
    <Strip
      id={id}
      role="option"
      aria-selected={active}
      kind={kind}
      onMouseMove={active ? undefined : onHover}
      // Keep focus in the input; the click still chooses.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onChoose}
      className={cn(
        'cursor-pointer py-1.5',
        active ? 'bg-card ring-2 ring-accent' : 'hover:bg-card',
      )}
    >
      {item.type === 'task' && (
        <TaskRow
          task={item.task}
          columnLabel={columnLabel}
          assignee={agentById(item.task.assigned_to)}
        />
      )}
      {item.type === 'page' && <PageRow page={item.page} />}
      {item.type === 'member' && (
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className={cn(
              'text-sm font-semibold truncate',
              kind === 'person' ? 'text-person-ink' : 'text-agent-ink',
            )}
          >
            {item.member.name}
          </span>
          <span className="text-mid text-muted shrink-0">{kindLabel(kind === 'person')}</span>
          {item.member.role && (
            <span className="text-mid text-muted truncate min-w-0">· {item.member.role}</span>
          )}
          <code className="ml-auto font-mono text-xxs text-muted shrink-0">{item.member.id}</code>
        </div>
      )}
      {item.type === 'project' && (
        <div className="flex items-center gap-2 min-w-0">
          <FolderGit2 size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <span className="text-sm font-semibold truncate">{item.project.name}</span>
          {item.project.description && (
            <span className="text-mid text-muted truncate min-w-0">{item.project.description}</span>
          )}
        </div>
      )}
    </Strip>
  )
}

function TaskRow({
  task,
  columnLabel,
  assignee,
}: {
  task: Task
  columnLabel: (slug: string) => string
  assignee?: Agent
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Code size="sm">{shortTaskId(task.id)}</Code>
        <Badge variant="default" size="xs">
          {columnLabel(task.status)}
        </Badge>
        <PriorityMark priority={task.priority} className="ml-auto" />
      </div>
      <div className="text-sm font-semibold mt-0.5 line-clamp-2">{task.title}</div>
      {(task.project || assignee) && (
        <div className="text-mid text-muted flex gap-2">
          {task.project && <span>{task.project}</span>}
          {assignee && (
            <span className={assignee.type === 'human' ? 'text-person-ink' : 'text-agent-ink'}>
              {assignee.name}
            </span>
          )}
        </div>
      )}
    </>
  )
}

function PageRow({ page }: { page: PageEntry }) {
  const Icon = PAGE_ICONS[page.href] ?? Settings
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon size={14} className="shrink-0 text-muted" aria-hidden="true" />
      {page.parent && (
        <span className="text-mid text-muted shrink-0">
          {page.parent} <span aria-hidden="true">›</span>
        </span>
      )}
      <span className="text-sm font-semibold truncate">{page.label}</span>
    </div>
  )
}
