// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { AddPersonModal } from '@/client/features/squad/AddPersonModal'
import { AddAgentModal } from '@/client/features/squad/AddAgentModal'
import { EditAgentModal } from '@/client/features/squad/EditAgentModal'
import { SquadAgentCard } from '@/client/features/squad/SquadAgentCard'
import { idProblem, slugify } from '@/client/features/squad/fields'
import type { SquadMember } from '@/client/features/squad/types'

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key
  const format = { relativeTime: (d: Date) => d.toISOString() }
  return {
    useTranslations: () => t,
    useFormatter: () => format,
    useNow: () => new Date(),
    useLocale: () => 'es',
  }
})

// The context editors fetch on mount; the card only needs to know they mount.
vi.mock('@/client/features/agent-context/AgentContextEditor', () => ({
  AgentContextEditor: () => <div data-testid="context-editor" />,
}))
vi.mock('@/client/features/agent-context/IdentityEditor', () => ({
  IdentityEditor: () => null,
}))
vi.mock('@/client/features/agent-context/IdentityHistory', () => ({
  IdentityHistory: () => null,
}))

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('slugify / idProblem', () => {
  it('folds accents and spaces into an API-valid id', () => {
    expect(slugify('Lucía Pérez')).toBe('lucia-perez')
    expect(slugify('  Revisor de PRs!  ')).toBe('revisor-de-prs')
    expect(slugify('x'.repeat(80))).toHaveLength(50)
  })

  it('names the problem with an id', () => {
    expect(idProblem('')).toBe('idRequired')
    expect(idProblem('Bad Id')).toBe('idInvalid')
    expect(idProblem('lucia', ['lucia'])).toBe('idTaken')
    expect(idProblem('lucia', ['ana'])).toBeNull()
  })
})

describe('AddPersonModal', () => {
  it('derives the id from the name and creates a person with the team API', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    const onAdd = vi.fn()
    render(<AddPersonModal onClose={() => {}} onAdd={onAdd} />)

    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Lucía Pérez' } })
    fireEvent.change(screen.getByLabelText('role'), { target: { value: 'Diseño' } })
    expect(screen.getByLabelText('id')).toHaveValue('lucia-perez')

    fireEvent.click(screen.getByRole('button', { name: 'createPerson' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalled())

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/agents')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      id: 'lucia-perez',
      name: 'Lucía Pérez',
      role: 'Diseño',
      type: 'human',
    })
  })

  it('keeps an id the user edited', () => {
    render(<AddPersonModal onClose={() => {}} onAdd={() => {}} />)
    fireEvent.change(screen.getByLabelText('id'), { target: { value: 'Lu Ci' } })
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Lucía' } })
    expect(screen.getByLabelText('id')).toHaveValue('luci')
  })

  it('shows errors next to their fields and does not call the API', () => {
    render(<AddPersonModal takenIds={['lucia']} onClose={() => {}} onAdd={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'createPerson' }))
    const name = screen.getByLabelText('name')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('errors.nameRequired')
    expect(name).toHaveFocus()

    fireEvent.change(name, { target: { value: 'Lucía' } })
    expect(name).not.toHaveAttribute('aria-invalid')
    fireEvent.click(screen.getByRole('button', { name: 'createPerson' }))
    const id = screen.getByLabelText('id')
    expect(id).toHaveAttribute('aria-invalid', 'true')
    expect(id.getAttribute('aria-describedby')).toContain(`${id.id}-error`)
    expect(screen.getByText(/errors\.idTaken/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the server error when creation fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: 'x' }) })
    render(<AddPersonModal onClose={() => {}} onAdd={() => {}} />)
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Ana' } })
    fireEvent.click(screen.getByRole('button', { name: 'createPerson' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('createPersonFailedWith')
  })
})

describe('AddAgentModal', () => {
  it('offers only agent types and flags an empty name inline', () => {
    render(<AddAgentModal onClose={() => {}} onAdd={() => {}} />)
    const options = screen.getAllByRole('option').map((o) => o.getAttribute('value'))
    expect(options).not.toContain('human')

    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    expect(screen.getByLabelText('name')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('id')).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('EditAgentModal', () => {
  it('flags an emptied name inline', () => {
    render(<EditAgentModal agent={agent()} onClose={() => {}} onSave={() => {}} />)
    const name = screen.getByLabelText('name')
    fireEvent.change(name, { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('errors.nameRequired')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

function agent(overrides: Partial<SquadMember> = {}): SquadMember {
  return {
    id: 'revisor',
    name: 'Revisor',
    type: 'cron',
    enabled: true,
    cron: { id: 'c1', enabled: true, schedule: '0 */6 * * *' },
    context: { persona: true, instructions: true, workingNotes: false, memoryFiles: [] },
    tasks: { assigned: 1, inProgress: 0, review: 0, done: 0 },
    ...overrides,
  }
}

function renderCard(member: SquadMember) {
  const onDelete = vi.fn()
  render(
    <SquadAgentCard member={member} onUpdate={() => {}} onEdit={() => {}} onDelete={onDelete} />,
  )
  fireEvent.click(screen.getByRole('button', { name: new RegExp(member.name) }))
  return { onDelete }
}

describe('SquadAgentCard', () => {
  it('opens to actions and a summary, with schedule and context collapsed', () => {
    renderCard(agent())

    const schedule = screen.getByRole('button', { name: /scheduleSection/ })
    const context = screen.getByRole('button', { name: /contextSection/ })
    expect(schedule).toHaveAttribute('aria-expanded', 'false')
    expect(context).toHaveAttribute('aria-expanded', 'false')
    expect(context).toHaveTextContent('ctx.persona · ctx.instructions')
    expect(screen.queryByTestId('context-editor')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('scheduleLabel')).not.toBeInTheDocument()

    fireEvent.click(context)
    expect(context).toHaveAttribute('aria-expanded', 'true')
    const panel = document.getElementById(context.getAttribute('aria-controls') ?? '')
    expect(panel).toContainElement(screen.getByTestId('context-editor'))
  })

  it('loads the run history when the schedule opens', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) })
    renderCard(agent())
    const schedule = screen.getByRole('button', { name: /scheduleSection/ })
    fireEvent.click(schedule)
    expect(schedule).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('scheduleLabel')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/agents/revisor/cron/history'))
    expect(await screen.findByText('noRuns')).toBeInTheDocument()
  })

  it('keeps delete quiet at rest and hands it to the confirmation', () => {
    const { onDelete } = renderCard(agent())
    const del = screen.getByRole('button', { name: 'deleteAgent' })
    expect(del.className).not.toMatch(/text-alert/)
    fireEvent.click(del)
    expect(onDelete).toHaveBeenCalledWith('revisor')
  })

  it('shows a person only the actions, no schedule or context', () => {
    renderCard(agent({ id: 'ana', name: 'Ana', type: 'human', cron: undefined }))
    expect(screen.getByRole('button', { name: 'removePerson' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /scheduleSection/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /contextSection/ })).not.toBeInTheDocument()
  })
})
