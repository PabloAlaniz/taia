// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { ProjectContextEditor } from '@/app/settings/projects/_components/project-context-editor'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockGet(context: unknown, versionMeta: Record<string, unknown> = {}) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      projectId: 'p-1',
      context,
      versionId: versionMeta.versionId ?? 'pcv_1',
      versionCreatedAt: versionMeta.versionCreatedAt ?? null,
      versionCreatedBy: versionMeta.versionCreatedBy ?? null,
    }),
  })
}

function mockPatchOk(savedContext: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      projectId: 'p-1',
      context: savedContext,
      versionId: 'pcv_2',
    }),
  })
}

const baseContext = {
  id: 'p-1',
  name: 'Acme',
  description: 'Acme product',
  glossary: { sla: 'service level agreement' },
  knowledgeRefs: [{ kind: 'doc', uri: 'docs/policy.md', description: 'policy', cacheable: true }],
}

describe('ProjectContextEditor', () => {
  it('renders existing glossary entries and supports remove', async () => {
    mockGet(baseContext)
    render(<ProjectContextEditor projectId="p-1" />)

    const term = await screen.findByText('sla')
    expect(term).toBeInTheDocument()
    expect(screen.getByText('service level agreement')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove glossary entry 1' }))
    expect(screen.queryByText('sla')).not.toBeInTheDocument()
  })

  it('renders existing knowledge refs and supports remove', async () => {
    mockGet(baseContext)
    render(<ProjectContextEditor projectId="p-1" />)

    const uri = await screen.findByText('docs/policy.md')
    expect(uri).toBeInTheDocument()
    expect(screen.getByText('policy')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove knowledge ref 1' }))
    expect(screen.queryByText('docs/policy.md')).not.toBeInTheDocument()
  })

  it('Save button is disabled until something changes', async () => {
    mockGet(baseContext)
    render(<ProjectContextEditor projectId="p-1" />)

    await waitFor(() => {
      expect(screen.getByText('sla')).toBeInTheDocument()
    })

    const saveBtn = screen.getByRole('button', { name: /Save context/i })
    expect(saveBtn).toBeDisabled()

    // Add a glossary entry to dirty.
    fireEvent.change(screen.getByPlaceholderText('Term'), { target: { value: 'pr' } })
    fireEvent.change(screen.getByPlaceholderText('Definition'), {
      target: { value: 'pull request' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(saveBtn).not.toBeDisabled()
  })

  it('Save fires PATCH with the merged context (glossary + refs)', async () => {
    mockGet(baseContext)
    mockPatchOk(baseContext)

    render(<ProjectContextEditor projectId="p-1" />)

    await waitFor(() => {
      expect(screen.getByText('sla')).toBeInTheDocument()
    })

    // Add another glossary entry.
    fireEvent.change(screen.getByPlaceholderText('Term'), { target: { value: 'wip' } })
    fireEvent.change(screen.getByPlaceholderText('Definition'), {
      target: { value: 'work in progress' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    fireEvent.click(screen.getByRole('button', { name: /Save context/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    const patchCall = fetchMock.mock.calls[1]
    expect(patchCall[0]).toBe('/api/projects/p-1/context')
    expect(patchCall[1].method).toBe('PATCH')
    const body = JSON.parse(patchCall[1].body)
    expect(body.context.glossary).toEqual({
      sla: 'service level agreement',
      wip: 'work in progress',
    })
    expect(body.context.knowledgeRefs).toEqual(baseContext.knowledgeRefs)
    expect(body.note).toBeTruthy()
  })

  it('renders even when the project has no context yet (context with empty fields)', async () => {
    mockGet({ id: 'p-1', name: 'Acme', description: '' }, { versionId: null })
    render(<ProjectContextEditor projectId="p-1" />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Term')).toBeInTheDocument()
    })
    // Save disabled because no changes against empty.
    const saveBtn = screen.getByRole('button', { name: /Save context/i })
    expect(saveBtn).toBeDisabled()
  })

  it('blocks duplicate glossary keys with an inline message', async () => {
    mockGet(baseContext)
    render(<ProjectContextEditor projectId="p-1" />)

    await waitFor(() => {
      expect(screen.getByText('sla')).toBeInTheDocument()
    })

    // Try to add the same term again.
    fireEvent.change(screen.getByPlaceholderText('Term'), { target: { value: 'sla' } })
    fireEvent.change(screen.getByPlaceholderText('Definition'), {
      target: { value: 'duplicate definition' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText(/already in glossary/i)).toBeInTheDocument()
  })
})
