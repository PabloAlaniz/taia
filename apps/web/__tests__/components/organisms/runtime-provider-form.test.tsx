// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { RuntimeProviderForm } from '@/components/organisms/runtime-provider-form'

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key
    t.has = () => false
    return t
  },
}))

const fetchMock = vi.fn()

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function selectProvider(id: string) {
  fireEvent.change(screen.getByLabelText('provider'), { target: { value: id } })
}

function lastBody(callIndex: number) {
  return JSON.parse(fetchMock.mock.calls[callIndex][1].body)
}

describe('RuntimeProviderForm', () => {
  it('defaults to standalone and saves it without a connection test', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    const onSaved = vi.fn()
    render(<RuntimeProviderForm onSaved={onSaved} />)

    expect(screen.getByLabelText('provider')).toHaveValue('none')
    expect(screen.queryByText('testConnection')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('saveAndActivate'))

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ provider: 'none', result: { ok: true } }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lastBody(0)).toEqual({ settings: { 'runtime.default_provider': 'none' } })
  })

  it('prefills the active provider from stored settings', () => {
    render(
      <RuntimeProviderForm
        initialSettings={{
          'runtime.default_provider': 'openclaw',
          'runtime.providers.openclaw.url': 'http://gw:18789',
          'runtime.providers.openclaw.token': '********',
        }}
      />,
    )

    expect(screen.getByLabelText('provider')).toHaveValue('openclaw')
    expect(screen.getByLabelText('fields.url *')).toHaveValue('http://gw:18789')
    expect(screen.getByText('secretStored')).toBeInTheDocument()
  })

  it('requires the provider-specific field before saving', () => {
    render(<RuntimeProviderForm />)
    selectProvider('anthropic')

    expect(screen.getByText('saveAndActivate')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('fields.token *'), { target: { value: 'sk-ant-x' } })
    expect(screen.getByText('saveAndActivate')).toBeEnabled()
  })

  it('saves a CLI provider with the enabled flag, then tests it', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, provider: 'claude-code', agents_found: 1 }))
    const onSaved = vi.fn()
    render(<RuntimeProviderForm onSaved={onSaved} />)
    selectProvider('claude-code')

    fireEvent.click(screen.getByText('saveAndActivate'))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(lastBody(0).settings).toEqual({
      'runtime.default_provider': 'claude-code',
      'runtime.providers.claude-code.command': 'claude',
      'runtime.providers.claude-code.cwd': '',
      'runtime.providers.claude-code.promptMode': 'arg',
      'runtime.providers.claude-code.enabled': 'true',
    })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/settings/test-connection')
    expect(lastBody(1)).toMatchObject({ provider: 'claude-code', command: 'claude' })
    // CLI runtimes don't host agents: no agent count in the message
    expect(screen.getByRole('status')).toHaveTextContent('connected')
  })

  it('shows the hint and does not report success when the test fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: false, hint: 'Credenciales inválidas' }))
    const onSaved = vi.fn()
    render(<RuntimeProviderForm />)
    selectProvider('openclaw')

    fireEvent.click(screen.getByText('saveAndActivate'))

    expect(await screen.findByText('Credenciales inválidas')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('tests without saving', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, agents_found: 4 }))
    render(<RuntimeProviderForm />)
    selectProvider('openclaw')

    fireEvent.click(screen.getByText('testConnection'))

    expect(await screen.findByRole('status')).toHaveTextContent('connectedAgents {"count":4}')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/settings/test-connection')
  })
})
