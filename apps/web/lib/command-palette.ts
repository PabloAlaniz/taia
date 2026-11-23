import type { Agent, Project, Task } from '@taia/types'

/** Where a page's label comes from: an existing i18n namespace and key. */
export interface PalettePage {
  href: string
  ns: 'nav' | 'pageTitles' | 'settingsPage'
  key: string
  /** Settings sub-pages read as "Configuración › Modelos". */
  inSettings?: boolean
}

/** Every page the palette can open; the first seven are the main nav. */
export const PALETTE_PAGES: PalettePage[] = [
  { href: '/', ns: 'nav', key: 'board' },
  { href: '/sessions', ns: 'nav', key: 'sessions' },
  { href: '/projects', ns: 'nav', key: 'projects' },
  { href: '/squad', ns: 'nav', key: 'team' },
  { href: '/dashboard', ns: 'nav', key: 'dashboard' },
  { href: '/calendar', ns: 'nav', key: 'calendar' },
  { href: '/settings', ns: 'nav', key: 'settings' },
  { href: '/settings/runtime', ns: 'settingsPage', key: 'runtimeTitle', inSettings: true },
  { href: '/settings/models', ns: 'settingsPage', key: 'modelsTitle', inSettings: true },
  { href: '/settings/worktrees', ns: 'pageTitles', key: 'worktrees', inSettings: true },
  { href: '/settings/profile', ns: 'pageTitles', key: 'profile', inSettings: true },
  { href: '/settings/general', ns: 'pageTitles', key: 'general', inSettings: true },
  { href: '/settings/audit', ns: 'pageTitles', key: 'audit', inSettings: true },
]

/** A page with its label already translated. */
export interface PageEntry {
  href: string
  label: string
  /** The parent section's label, for settings sub-pages. */
  parent?: string
}

export type PaletteItem =
  | { type: 'task'; key: string; task: Task }
  | { type: 'page'; key: string; page: PageEntry }
  | { type: 'member'; key: string; member: Agent }
  | { type: 'project'; key: string; project: Project }

export type PaletteGroupKey = 'waiting' | 'tasks' | 'pages' | 'team' | 'projects'

export interface PaletteGroup {
  key: PaletteGroupKey
  items: PaletteItem[]
}

export const PALETTE_LIMITS = { tasks: 8, waiting: 5, pages: 6, team: 5, projects: 5 } as const

/** Case- and accent-insensitive: "configuracion" finds "Configuración". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Keeps what matches and puts the ones whose first field starts with the query
 * first, so "eq" lands on "Equipo" before "Pequeño".
 */
function rank<T>(items: T[], q: string, fields: (item: T) => (string | undefined)[]): T[] {
  const starts: T[] = []
  const contains: T[] = []
  for (const item of items) {
    const values = fields(item)
      .filter((v): v is string => Boolean(v))
      .map(normalize)
    if (values[0]?.startsWith(q)) starts.push(item)
    else if (values.some((v) => v.includes(q))) contains.push(item)
  }
  return [...starts, ...contains]
}

/** Tasks match as before: title, id, project name or a tag. */
export function matchTask(task: Task, q: string): boolean {
  return [task.title, task.id, task.project, ...(task.tags ?? [])].some(
    (v) => typeof v === 'string' && normalize(v).includes(q),
  )
}

export interface PaletteSources {
  query: string
  tasks: Task[]
  members: Agent[]
  projects: Project[]
  pages: PageEntry[]
  /** Ids of tasks that wait on a person; shown when the query is empty. */
  waitingTaskIds?: string[]
}

/**
 * The palette's sections in display order, empty ones dropped. With a query:
 * tasks, pages, team, projects. Without one: what waits on you, then the main
 * pages.
 */
export function buildPaletteGroups({
  query,
  tasks,
  members,
  projects,
  pages,
  waitingTaskIds = [],
}: PaletteSources): PaletteGroup[] {
  const q = normalize(query.trim())
  const groups: PaletteGroup[] = []
  const push = (key: PaletteGroupKey, items: PaletteItem[]) => {
    if (items.length > 0) groups.push({ key, items })
  }

  const taskItem = (task: Task): PaletteItem => ({ type: 'task', key: `task:${task.id}`, task })
  const pageItem = (page: PageEntry): PaletteItem => ({
    type: 'page',
    key: `page:${page.href}`,
    page,
  })

  if (!q) {
    const waiting = new Set(waitingTaskIds)
    push(
      'waiting',
      tasks
        .filter((t) => waiting.has(t.id))
        .slice(0, PALETTE_LIMITS.waiting)
        .map(taskItem),
    )
    push('pages', pages.filter((p) => !p.parent).map(pageItem))
    return groups
  }

  push(
    'tasks',
    tasks
      .filter((t) => matchTask(t, q))
      .slice(0, PALETTE_LIMITS.tasks)
      .map(taskItem),
  )
  push(
    'pages',
    rank(pages, q, (p) => [p.label, p.parent, p.href])
      .slice(0, PALETTE_LIMITS.pages)
      .map(pageItem),
  )
  push(
    'team',
    rank(members, q, (m) => [m.name, m.role, m.id])
      .slice(0, PALETTE_LIMITS.team)
      .map((member) => ({ type: 'member' as const, key: `member:${member.id}`, member })),
  )
  push(
    'projects',
    rank(projects, q, (p) => [p.name, p.description, p.id])
      .slice(0, PALETTE_LIMITS.projects)
      .map((project) => ({ type: 'project' as const, key: `project:${project.id}`, project })),
  )
  return groups
}

/** Where choosing a non-task item goes. Tasks are opened by the caller. */
export function paletteHref(item: PaletteItem): string | null {
  switch (item.type) {
    case 'page':
      return item.page.href
    case 'member':
      return `/squad?member=${encodeURIComponent(item.member.id)}`
    case 'project':
      return `/projects/${encodeURIComponent(item.project.id)}`
    default:
      return null
  }
}
