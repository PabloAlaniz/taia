// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { IdentityEditor } from '@/client/features/agent-context/IdentityEditor'

vi.mock('next-intl', () => {
  // Stable references, so effects don't re-run on every render.
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key
  const format = {
    dateTime: (d: Date) => d.toISOString(),
    relativeTime: (d: Date) => d.toISOString(),
    number: (n: number) => String(n),
  }
  return {
    useTranslations: () => t,
    useFormatter: () => format,
    useNow: () => new Date(),
    useLocale: () => 'es',
  }
})

// The Checkbox atom wraps both <input> and a <span> label inside <label>,
// which getByLabelText doesn't reliably resolve. Helper that walks DOM
// instead of relying on accessibility name resolution.
function checkboxByLabel(text: string): HTMLInputElement {
  const span = screen.getByText(text)
  const label = span.closest('label')
  if (!label) throw new Error(`No <label> ancestor for "${text}"`)
  const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (!input) throw new Error(`No checkbox inside label for "${text}"`)
  return input
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockGet(identity: unknown, versionMeta: Record<string, unknown> = {}) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      agentId: 'alex',
      identity,
      versionId: versionMeta.versionId ?? 'aiv_1',
      versionCreatedAt: versionMeta.versionCreatedAt ?? null,
      versionCreatedBy: versionMeta.versionCreatedBy ?? null,
    }),
  })
}

function mockPatchOk(savedIdentity: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      agentId: 'alex',
      identity: savedIdentity,
      versionId: 'aiv_2',
    }),
  })
}

const baseIdentity = {
  id: 'alex',
  name: 'Alex',
  role: 'Reviewer',
  persona: 'careful',
  instructions: 'always test',
  capabilities: ['read_tasks', 'comment_tasks'],
  constraints: ['never approve without tests'],
}

describe('IdentityEditor', () => {
  it('renders capabilities as checkboxes with the correct ones checked', async () => {
    mockGet(baseIdentity)
    const { container } = render(<IdentityEditor agentId="alex" />)

    // First wait for the initial load to settle (Loading… → form rendered).
    await waitFor(() => {
      expect(container.querySelector('input[type="checkbox"]')).not.toBeNull()
    })

    const checkboxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    )
    expect(checkboxes).toHaveLength(6)
    // Map each checkbox to the visible label text inside its <label> wrapper.
    const labels = checkboxes.map((cb) => cb.closest('label')?.querySelector('span')?.textContent)
    expect(labels).toContain('caps.read_tasks.label')
    // Currently checked ones should match baseIdentity.capabilities.
    const checked = checkboxes
      .filter((cb) => cb.checked)
      .map((cb) => cb.closest('label')?.querySelector('span')?.textContent)
    expect(checked).toEqual(
      expect.arrayContaining(['caps.read_tasks.label', 'caps.comment_tasks.label']),
    )
    expect(checked).not.toContain('caps.memory.label')
    expect(checkboxByLabel('caps.comment_tasks.label')).toBeChecked()
    expect(checkboxByLabel('caps.write_tasks.label')).not.toBeChecked()
    expect(checkboxByLabel('caps.memory.label')).not.toBeChecked()
  })

  it('renders existing constraints and supports remove', async () => {
    mockGet(baseIdentity)
    render(<IdentityEditor agentId="alex" />)

    const constraintRow = await screen.findByText('never approve without tests')
    expect(constraintRow).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'removeConstraint {"n":1}' }))
    expect(screen.queryByText('never approve without tests')).not.toBeInTheDocument()
  })

  it('Save button is disabled until something changes', async () => {
    mockGet(baseIdentity)
    render(<IdentityEditor agentId="alex" />)

    await waitFor(() => {
      expect(checkboxByLabel('caps.read_tasks.label')).toBeChecked()
    })

    const saveBtn = screen.getByRole('button', { name: /^save$/ })
    expect(saveBtn).toBeDisabled()

    // Toggle a capability to dirty the form.
    fireEvent.click(checkboxByLabel('caps.memory.label'))
    expect(saveBtn).not.toBeDisabled()
  })

  it('Save fires PATCH with the merged identity (capabilities updated)', async () => {
    mockGet(baseIdentity)
    mockPatchOk({
      ...baseIdentity,
      capabilities: ['read_tasks', 'comment_tasks', 'memory'],
    })

    const onSaved = vi.fn()
    render(<IdentityEditor agentId="alex" onSaved={onSaved} />)

    await waitFor(() => {
      expect(checkboxByLabel('caps.read_tasks.label')).toBeChecked()
    })

    fireEvent.click(checkboxByLabel('caps.memory.label'))
    fireEvent.click(screen.getByRole('button', { name: /^save$/ }))

    await waitFor(() => {
      // GET (initial load) + PATCH = 2 calls.
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    const patchCall = fetchMock.mock.calls[1]
    expect(patchCall[0]).toBe('/api/agents/alex/context')
    expect(patchCall[1].method).toBe('PATCH')
    const body = JSON.parse(patchCall[1].body)
    expect(body.identity.capabilities).toContain('memory')
    expect(body.identity.capabilities).toContain('read_tasks')
    expect(body.identity.capabilities).toContain('comment_tasks')
    expect(body.identity.constraints).toEqual(['never approve without tests'])
    expect(body.note).toBeTruthy()
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })

  it('Add constraint via the input + button appends to the list', async () => {
    mockGet(baseIdentity)
    render(<IdentityEditor agentId="alex" />)

    await waitFor(() => {
      expect(screen.getByText('never approve without tests')).toBeInTheDocument()
    })

    const input = screen.getByLabelText('newConstraint')
    fireEvent.change(input, { target: { value: 'always read the diff' } })
    fireEvent.click(screen.getByRole('button', { name: 'addConstraint' }))

    expect(screen.getByText('always read the diff')).toBeInTheDocument()
    // Input cleared after add.
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('renders even when the agent has no identity yet (identity:null)', async () => {
    mockGet(null)
    render(<IdentityEditor agentId="alex" />)

    await waitFor(() => {
      // Capabilities still listed, all unchecked.
      expect(checkboxByLabel('caps.read_tasks.label')).not.toBeChecked()
    })
    expect(checkboxByLabel('caps.memory.label')).not.toBeChecked()

    // Save disabled because no changes against an empty identity.
    const saveBtn = screen.getByRole('button', { name: /^save$/ })
    expect(saveBtn).toBeDisabled()
  })

  it('shows an error alert when GET fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    })
    render(<IdentityEditor agentId="alex" />)

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/i)).toBeInTheDocument()
    })
  })
})
