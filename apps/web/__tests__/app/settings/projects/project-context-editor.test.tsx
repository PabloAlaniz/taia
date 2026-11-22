// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { ProjectContextEditor } from '@/app/settings/projects/_components/project-context-editor'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useFormatter: () => ({
    dateTime: (d: Date) => d.toISOString(),
    relativeTime: (d: Date) => d.toISOString(),
  }),
  useNow: () => new Date(),
}))

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

    fireEvent.click(screen.getByRole('button', { name: 'removeTerm {"term":"sla"}' }))
    expect(screen.queryByText('sla')).not.toBeInTheDocument()
  })

  it('renders existing knowledge refs and supports remove', async () => {
    mockGet(baseContext)
    render(<ProjectContextEditor projectId="p-1" />)

    const uri = await screen.findByText('docs/policy.md')
    expect(uri).toBeInTheDocument()
    expect(screen.getByText('policy')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'removeRef {"uri":"docs/policy.md"}' }))
    expect(screen.queryByText('docs/policy.md')).not.toBeInTheDocument()
  })

  it('Save button is disabled until something changes', async () => {
    mockGet(baseContext)
    render(<ProjectContextEditor projectId="p-1" />)

    await waitFor(() => {
      expect(screen.getByText('sla')).toBeInTheDocument()
    })

    const saveBtn = screen.getByRole('button', { name: 'save' })
    expect(saveBtn).toBeDisabled()

    // Add a glossary entry to dirty.
    fireEvent.change(screen.getByPlaceholderText('termPlaceholder'), { target: { value: 'pr' } })
    fireEvent.change(screen.getByPlaceholderText('definitionPlaceholder'), {
      target: { value: 'pull request' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'addTerm' }))

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
    fireEvent.change(screen.getByPlaceholderText('termPlaceholder'), { target: { value: 'wip' } })
    fireEvent.change(screen.getByPlaceholderText('definitionPlaceholder'), {
      target: { value: 'work in progress' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'addTerm' }))

    fireEvent.click(screen.getByRole('button', { name: 'save' }))

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
      expect(screen.getByPlaceholderText('termPlaceholder')).toBeInTheDocument()
    })
    // Save disabled because no changes against empty.
    const saveBtn = screen.getByRole('button', { name: 'save' })
    expect(saveBtn).toBeDisabled()
  })

  it('blocks duplicate glossary keys with an inline message', async () => {
    mockGet(baseContext)
    render(<ProjectContextEditor projectId="p-1" />)

    await waitFor(() => {
      expect(screen.getByText('sla')).toBeInTheDocument()
    })

    // Try to add the same term again.
    fireEvent.change(screen.getByPlaceholderText('termPlaceholder'), { target: { value: 'sla' } })
    fireEvent.change(screen.getByPlaceholderText('definitionPlaceholder'), {
      target: { value: 'duplicate definition' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'addTerm' }))

    expect(screen.getByText(/^duplicateTerm/)).toBeInTheDocument()
  })
})
