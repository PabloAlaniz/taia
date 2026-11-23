import { describe, it, expect } from 'vitest'
import type { Agent, Project, Task } from '@taia/types'
import {
  buildPaletteGroups,
  normalize,
  paletteHref,
  PALETTE_LIMITS,
  PALETTE_PAGES,
  type PageEntry,
} from '@/lib/command-palette'

const task = (id: string, title: string, extra: Partial<Task> = {}) =>
  ({ id, title, status: 'todo', priority: 'medium', ...extra }) as Task
const member = (id: string, name: string, extra: Partial<Agent> = {}) =>
  ({ id, name, status: 'idle', avatar: '', ...extra }) as Agent
const project = (id: string, name: string, description?: string) =>
  ({ id, name, description, created_at: '', updated_at: '' }) as Project

const pages: PageEntry[] = [
  { href: '/', label: 'Tablero' },
  { href: '/squad', label: 'Equipo' },
  { href: '/settings', label: 'Configuración' },
  { href: '/settings/models', label: 'Modelos', parent: 'Configuración' },
]

const sources = {
  tasks: [
    task('t-1', 'Fix login form', { tags: ['auth'] }),
    task('t-2', 'Write equipo docs'),
    task('t-3', 'Clarify scope', { tags: ['needs-clarification'] }),
  ],
  members: [
    member('builder', 'Builder', { type: 'api', role: 'Backend' }),
    member('ana', 'Ana', { type: 'human' }),
  ],
  projects: [project('p-1', 'Equipo web', 'Frontend'), project('p-2', 'Infra')],
  pages,
}

describe('buildPaletteGroups', () => {
  it('shows what waits on you and the main pages when the query is empty', () => {
    const groups = buildPaletteGroups({ ...sources, query: '  ', waitingTaskIds: ['t-3'] })
    expect(groups.map((g) => g.key)).toEqual(['waiting', 'pages'])
    expect(groups[0].items.map((i) => i.key)).toEqual(['task:t-3'])
    // Settings sub-pages only appear once you type.
    expect(groups[1].items.map((i) => i.key)).toEqual(['page:/', 'page:/squad', 'page:/settings'])
  })

  it('drops the waiting section when nothing waits', () => {
    const groups = buildPaletteGroups({ ...sources, query: '' })
    expect(groups.map((g) => g.key)).toEqual(['pages'])
  })

  it('puts tasks first, then pages, team and projects', () => {
    const groups = buildPaletteGroups({ ...sources, query: 'equipo' })
    expect(groups.map((g) => g.key)).toEqual(['tasks', 'pages', 'projects'])
    expect(groups[0].items.map((i) => i.key)).toEqual(['task:t-2'])
  })

  it('matches people and agents by name, role or id', () => {
    expect(buildPaletteGroups({ ...sources, query: 'backend' })[0]).toMatchObject({
      key: 'team',
      items: [{ key: 'member:builder' }],
    })
    expect(buildPaletteGroups({ ...sources, query: 'ana' })[0].items[0].key).toBe('member:ana')
  })

  it('is accent- and case-insensitive and finds settings sub-pages by parent', () => {
    const groups = buildPaletteGroups({ ...sources, query: 'CONFIGURACION' })
    expect(groups).toHaveLength(1)
    expect(groups[0].items.map((i) => i.key)).toEqual(['page:/settings', 'page:/settings/models'])
  })

  it('ranks prefix matches before contained ones', () => {
    const groups = buildPaletteGroups({
      ...sources,
      tasks: [],
      projects: [project('p-9', 'Old web'), project('p-8', 'Web app')],
      query: 'web',
    })
    expect(groups[0].items.map((i) => i.key)).toEqual(['project:p-8', 'project:p-9'])
  })

  it('caps each section', () => {
    const many = Array.from({ length: 20 }, (_, i) => task(`t-${i}`, `Task ${i}`))
    const groups = buildPaletteGroups({ ...sources, tasks: many, query: 'task' })
    expect(groups[0].items).toHaveLength(PALETTE_LIMITS.tasks)
  })
})

describe('paletteHref', () => {
  it('routes members to their squad row and projects to their page', () => {
    const [team] = buildPaletteGroups({ ...sources, query: 'builder' })
    expect(paletteHref(team.items[0])).toBe('/squad?member=builder')
    const [projects] = buildPaletteGroups({ ...sources, query: 'infra' })
    expect(paletteHref(projects.items[0])).toBe('/projects/p-2')
  })

  it('leaves tasks to the caller', () => {
    const [tasks] = buildPaletteGroups({ ...sources, query: 'login' })
    expect(paletteHref(tasks.items[0])).toBeNull()
  })
})

describe('normalize', () => {
  it('strips accents and case', () => {
    expect(normalize('Configuración')).toBe('configuracion')
  })
})

describe('PALETTE_PAGES', () => {
  it('lists each page once', () => {
    const hrefs = PALETTE_PAGES.map((p) => p.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('has no settings page for projects or the team: both live in the top nav', () => {
    const settings = PALETTE_PAGES.filter((p) => p.inSettings).map((p) => p.href)
    expect(settings).not.toContain('/settings/projects')
    expect(settings).not.toContain('/squad')
    expect(PALETTE_PAGES.map((p) => p.href)).toContain('/projects')
  })
})
