// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { AgentContextEditor } from '@/client/features/agent-context/AgentContextEditor'

const fetchMock = vi.fn()

function respond(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body })
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method) return respond({ ok: true })
    if (url.endsWith('/context')) {
      return respond({ identity: { persona: 'Careful reviewer.', instructions: 'Review PRs.' } })
    }
    if (url.endsWith('/working-state')) return respond({ content: 'Halfway.' })
    if (url.endsWith('/memory')) return respond({ files: ['prefs.md'] })
    if (url.endsWith('/memory/prefs.md')) return respond({ content: 'Likes tea.' })
    return respond({})
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function lastWrite() {
  const call = fetchMock.mock.calls.filter(([, init]) => init?.method).at(-1)!
  return { url: call[0] as string, method: call[1].method, body: JSON.parse(call[1].body) }
}

describe('AgentContextEditor', () => {
  it('edits the persona through the typed context API', async () => {
    render(<AgentContextEditor agentId="alex" />)
    const textarea = await screen.findByLabelText('Persona')
    await waitFor(() => expect(textarea).toHaveValue('Careful reviewer.'))

    fireEvent.change(textarea, { target: { value: 'Meticulous reviewer.' } })
    fireEvent.click(screen.getByText('Save'))

    await screen.findByText('Saved')
    expect(lastWrite()).toEqual({
      url: '/api/agents/alex/context',
      method: 'PATCH',
      body: { identity: { persona: 'Meticulous reviewer.' }, note: 'Edited persona' },
    })
  })

  it('saves working notes to the working-state API', async () => {
    render(<AgentContextEditor agentId="alex" />)
    fireEvent.click(await screen.findByText('Working notes'))
    const textarea = screen.getByLabelText('Working notes')
    await waitFor(() => expect(textarea).toHaveValue('Halfway.'))

    fireEvent.change(textarea, { target: { value: 'Done with file 3.' } })
    fireEvent.click(screen.getByText('Save'))

    await screen.findByText('Saved')
    expect(lastWrite()).toMatchObject({
      url: '/api/agents/alex/working-state',
      method: 'PUT',
      body: { content: 'Done with file 3.' },
    })
  })

  it('opens and saves a memory file', async () => {
    render(<AgentContextEditor agentId="alex" />)
    fireEvent.click(await screen.findByText('Memory (1)'))
    fireEvent.change(screen.getByLabelText('Memory file'), { target: { value: 'prefs.md' } })
    const textarea = screen.getByLabelText('Memory')
    await waitFor(() => expect(textarea).toHaveValue('Likes tea.'))

    fireEvent.change(textarea, { target: { value: 'Likes mate.' } })
    fireEvent.click(screen.getByText('Save'))

    await screen.findByText('Saved')
    expect(lastWrite()).toMatchObject({
      url: '/api/agents/alex/memory/prefs.md',
      method: 'PUT',
      body: { content: 'Likes mate.' },
    })
  })

  it('renders extra tabs first and never calls the legacy files API', async () => {
    render(
      <AgentContextEditor
        agentId="alex"
        extraTabs={[{ key: 'identity', label: 'Identity', content: <p>identity form</p> }]}
      />,
    )
    expect(await screen.findByText('identity form')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/files'))).toBe(false)
  })
})
