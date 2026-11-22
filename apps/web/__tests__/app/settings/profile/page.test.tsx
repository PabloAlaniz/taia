// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import UserProfilePage from '@/app/settings/profile/page'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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

function mockGet(profile: unknown, versionMeta: Record<string, unknown> = {}) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      userId: 'default',
      profile,
      versionId: versionMeta.versionId ?? 'upv_1',
      versionCreatedAt: versionMeta.versionCreatedAt ?? null,
      versionCreatedBy: versionMeta.versionCreatedBy ?? null,
    }),
  })
}

function mockPatchOk(savedProfile: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      userId: 'default',
      profile: savedProfile,
      versionId: 'upv_2',
    }),
  })
}

const baseProfile = {
  id: 'default',
  displayName: 'Sam',
  facts: ['likes short answers'],
  preferences: { language: 'es' },
  doNotDo: ['guess when uncertain'],
}

describe('UserProfilePage', () => {
  it('renders existing facts, preferences, and doNotDo entries', async () => {
    mockGet(baseProfile)
    render(<UserProfilePage />)

    await screen.findByText('likes short answers')
    expect(screen.getByText('language')).toBeInTheDocument()
    expect(screen.getByText('es')).toBeInTheDocument()
    expect(screen.getByText('guess when uncertain')).toBeInTheDocument()
  })

  it('Save button is disabled until something changes', async () => {
    mockGet(baseProfile)
    render(<UserProfilePage />)

    await waitFor(() => {
      expect(screen.getByText('likes short answers')).toBeInTheDocument()
    })

    const saveBtn = screen.getByRole('button', { name: 'save' })
    expect(saveBtn).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('factPlaceholder'), {
      target: { value: 'CTO of TAIA' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'addFact' }))
    expect(saveBtn).not.toBeDisabled()
  })

  it('Save fires PATCH with the merged profile', async () => {
    mockGet(baseProfile)
    mockPatchOk(baseProfile)
    render(<UserProfilePage />)

    await waitFor(() => {
      expect(screen.getByText('likes short answers')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('factPlaceholder'), {
      target: { value: 'works on AI agents' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'addFact' }))

    fireEvent.click(screen.getByRole('button', { name: 'save' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    const patchCall = fetchMock.mock.calls[1]
    expect(patchCall[0]).toBe('/api/user/profile')
    expect(patchCall[1].method).toBe('PATCH')
    const body = JSON.parse(patchCall[1].body)
    expect(body.profile.facts).toEqual(['likes short answers', 'works on AI agents'])
    expect(body.profile.preferences).toEqual({ language: 'es' })
    expect(body.profile.doNotDo).toEqual(['guess when uncertain'])
    expect(body.profile.displayName).toBe('Sam')
  })

  it('blocks duplicate preference keys with an inline message', async () => {
    mockGet(baseProfile)
    render(<UserProfilePage />)

    await waitFor(() => {
      expect(screen.getByText('language')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('keyPlaceholder'), {
      target: { value: 'language' },
    })
    fireEvent.change(screen.getByPlaceholderText('valuePlaceholder'), { target: { value: 'en' } })
    fireEvent.click(screen.getByRole('button', { name: 'addPref' }))

    expect(screen.getByText('duplicatePref')).toBeInTheDocument()
  })

  it('renders the singleton fallback profile when no version exists', async () => {
    mockGet({ id: 'default', displayName: 'TAIA user' }, { versionId: null })
    render(<UserProfilePage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('TAIA user')).toBeInTheDocument()
    })
    const saveBtn = screen.getByRole('button', { name: 'save' })
    expect(saveBtn).toBeDisabled()
  })
})
