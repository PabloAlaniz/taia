// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { IdentityHistory } from '@/client/features/agent-context/IdentityHistory'

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key
  const format = { dateTime: (d: Date) => d.toISOString() }
  return { useTranslations: () => t, useFormatter: () => format }
})

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const versions = [
  {
    versionId: 'aiv_2',
    content: { persona: 'now', instructions: 'current rules' },
    createdAt: '2026-11-20T10:00:00.000Z',
    createdBy: 'ui:context',
    note: 'Edited persona',
  },
  {
    versionId: 'aiv_1',
    content: { persona: 'before', instructions: '' },
    createdAt: '2026-11-19T10:00:00.000Z',
    createdBy: null,
    note: null,
  },
]

function mockVersions(list: unknown[] = versions) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ versions: list }) })
}

describe('IdentityHistory', () => {
  it('lists versions newest first; only older ones can be restored', async () => {
    mockVersions()
    render(<IdentityHistory agentId="alex" onRestored={() => {}} />)

    await waitFor(() => expect(screen.getByText(/^current /)).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/agents/alex/context/versions')
    expect(screen.getByText('ui:context · Edited persona')).toBeInTheDocument()
    expect(screen.getByText('unknownAuthor')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'restore' })).toHaveLength(1)
  })

  it('previews persona and instructions, marking empty fields', async () => {
    mockVersions()
    render(<IdentityHistory agentId="alex" onRestored={() => {}} />)

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'preview' })).toHaveLength(2))
    fireEvent.click(screen.getAllByRole('button', { name: 'preview' })[1])

    expect(screen.getByText('before')).toBeInTheDocument()
    expect(screen.getByText('emptyField')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'hide' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('restores an older version with POST and tells the caller', async () => {
    mockVersions()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    mockVersions()
    const onRestored = vi.fn()
    render(<IdentityHistory agentId="alex" onRestored={onRestored} />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'restore' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'restore' }))

    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/agents/alex/context/versions/aiv_1/restore')
    expect(init.method).toBe('POST')
  })

  it('shows the server error when a restore fails', async () => {
    mockVersions()
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'stale' }),
    })
    const onRestored = vi.fn()
    render(<IdentityHistory agentId="alex" onRestored={onRestored} />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'restore' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'restore' }))

    await waitFor(() =>
      expect(screen.getByText('restoreFailed {"error":"stale"}')).toBeInTheDocument(),
    )
    expect(onRestored).not.toHaveBeenCalled()
  })

  it('says so when there are no versions yet', async () => {
    mockVersions([])
    render(<IdentityHistory agentId="alex" onRestored={() => {}} />)
    await waitFor(() => expect(screen.getByText('empty')).toBeInTheDocument())
  })
})
