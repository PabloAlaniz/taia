// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Agent, Project, Task } from '@taia/types'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      `${ns ? `${ns}.` : ''}${key}${values ? ` ${JSON.stringify(values)}` : ''}`
    return t
  },
}))

const storeState = {
  boardColumns: [{ slug: 'todo', label: 'To do' }],
  projects: [{ id: 'p-1', name: 'Website', created_at: '', updated_at: '' }] as Project[],
}
vi.mock('@/lib/store', () => ({
  useStore: (select: (s: typeof storeState) => unknown) => select(storeState),
}))

let waiting: Record<string, unknown> = {}
vi.mock('@/lib/use-shell-signals', () => ({ useWaiting: () => waiting }))

import { SearchBar } from '@/components/organisms/search-bar'

const tasks = [
  { id: 'task-aaaa1111', title: 'Website copy', status: 'todo', priority: 'high' },
  { id: 'task-bbbb2222', title: 'Answer the agent', status: 'todo', priority: 'low' },
] as Task[]
const agents = [
  { id: 'builder', name: 'Builder', type: 'api', status: 'idle', avatar: '' },
  { id: 'ana', name: 'Ana', type: 'human', status: 'idle', avatar: '' },
] as Agent[]

function setup() {
  const onSelectTask = vi.fn()
  const onClose = vi.fn()
  render(<SearchBar tasks={tasks} agents={agents} onSelectTask={onSelectTask} onClose={onClose} />)
  const input = screen.getByRole('combobox')
  return { onSelectTask, onClose, input }
}

const activeOption = (input: HTMLElement) =>
  document.getElementById(input.getAttribute('aria-activedescendant') ?? '')

beforeEach(() => {
  push.mockReset()
  waiting = {}
})

describe('SearchBar palette', () => {
  it('opens on the main pages and what waits on you, with the input focused', () => {
    waiting = { 'task-bbbb2222': { kind: 'clarify' } }
    const { input } = setup()
    expect(input).toHaveFocus()
    expect(screen.getByRole('group', { name: 'search.groups.waiting' })).toHaveTextContent(
      'Answer the agent',
    )
    const pages = screen.getByRole('group', { name: 'search.groups.pages' })
    expect(pages).toHaveTextContent('nav.board')
    expect(pages).not.toHaveTextContent('settingsPage.modelsTitle')
    expect(activeOption(input)).toHaveTextContent('Answer the agent')
  })

  it('groups matches with tasks first and walks them with the arrow keys', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'web' } })
    const groups = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))
    expect(groups).toEqual(['search.groups.tasks', 'search.groups.projects'])

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(options[0]).toHaveAttribute('aria-selected', 'false')

    // Wraps at both ends.
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
  })

  it('opens a task through the caller', () => {
    const { input, onSelectTask, onClose } = setup()
    fireEvent.change(input, { target: { value: 'website copy' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelectTask).toHaveBeenCalledWith('task-aaaa1111')
    expect(onClose).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('takes a member to their row on the team page', () => {
    const { input, onClose } = setup()
    fireEvent.change(input, { target: { value: 'ana' } })
    const option = screen.getByRole('option', { name: /Ana/ })
    expect(option).toHaveTextContent('squad.kind.person')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/squad?member=ana')
    expect(onClose).toHaveBeenCalled()
  })

  it('opens pages and projects on click', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'modelstitle' } })
    fireEvent.click(screen.getByRole('option'))
    expect(push).toHaveBeenCalledWith('/settings/models')

    fireEvent.change(input, { target: { value: 'website' } })
    fireEvent.click(screen.getByRole('option', { name: /^Website$/ }))
    expect(push).toHaveBeenLastCalledWith('/projects/p-1')
  })

  it('says so when nothing matches, without a fake option', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('search.noResults')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-activedescendant')
    expect(screen.getByRole('status')).toHaveTextContent('search.resultsCount {"count":0}')
  })

  it('closes on Escape', () => {
    const { input, onClose } = setup()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
