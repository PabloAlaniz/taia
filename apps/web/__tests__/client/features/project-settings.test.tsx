// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Project } from '@taia/types'

import { DeleteProject } from '@/client/features/project-settings/DeleteProject'
import { ProjectDetailsForm } from '@/client/features/project-settings/ProjectDetailsForm'
import { ProjectRepositories } from '@/client/features/project-settings/ProjectRepositories'
import { ProjectViewNav } from '@/components/molecules/project-view-nav'

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key
  return { useTranslations: () => t }
})

const api = vi.hoisted(() => ({
  projects: {
    update: vi.fn(),
    delete: vi.fn(),
    repositories: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock('@/lib/api', () => ({ api }))

const project = { id: 'p-1', name: 'Web', description: 'Site' } as Project

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProjectViewNav', () => {
  it('links both views and marks the current one', () => {
    render(<ProjectViewNav projectId="p 1" current="settings" />)
    const nav = screen.getByRole('navigation', { name: 'views' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'viewOverview' })).toHaveAttribute(
      'href',
      '/projects/p%201',
    )
    const settings = screen.getByRole('link', { name: 'viewSettings' })
    expect(settings).toHaveAttribute('href', '/projects/p%201/settings')
    expect(settings).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'viewOverview' })).not.toHaveAttribute('aria-current')
  })
})

describe('DeleteProject', () => {
  it('asks first, and cancelling deletes nothing', () => {
    const onDeleted = vi.fn()
    render(<DeleteProject project={project} onDeleted={onDeleted} />)
    fireEvent.click(screen.getByRole('button', { name: 'confirmDelete.action' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    expect(api.projects.delete).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('deletes on confirm and hands back to the caller', async () => {
    api.projects.delete.mockResolvedValue({ ok: true })
    const onDeleted = vi.fn()
    render(<DeleteProject project={project} onDeleted={onDeleted} />)
    fireEvent.click(screen.getByRole('button', { name: 'confirmDelete.action' }))
    const dialog = screen.getByRole('dialog')
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'confirmDelete.action',
    )
    fireEvent.click(confirm!)
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(api.projects.delete).toHaveBeenCalledWith('p-1')
  })
})

describe('ProjectDetailsForm', () => {
  it('saves only when something changed, and reports the saved project', async () => {
    const saved = { ...project, name: 'Web app' }
    api.projects.update.mockResolvedValue({ ok: true, project: saved })
    const onSaved = vi.fn()
    render(<ProjectDetailsForm project={project} onSaved={onSaved} />)
    const save = screen.getByRole('button', { name: 'update' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/nameLabel/), { target: { value: 'Web app' } })
    fireEvent.click(save)
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(api.projects.update).toHaveBeenCalledWith('p-1', {
      name: 'Web app',
      description: 'Site',
    })
  })
})

describe('ProjectRepositories', () => {
  it('lists the repositories and adds one', async () => {
    api.projects.repositories.list.mockResolvedValue({
      repositories: [{ id: 'r-1', name: 'web', url: 'https://example.com/web', is_primary: true }],
    })
    api.projects.repositories.create.mockResolvedValue({ ok: true })
    render(<ProjectRepositories projectId="p-1" />)
    expect(await screen.findByText('web')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'addRepo' }))
    fireEvent.change(screen.getByLabelText(/repoNameLabel/), { target: { value: 'api' } })
    fireEvent.change(screen.getByLabelText(/repoUrlLabel/), {
      target: { value: 'https://example.com/api' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'repoCreate' }))
    await waitFor(() =>
      expect(api.projects.repositories.create).toHaveBeenCalledWith('p-1', {
        name: 'api',
        url: 'https://example.com/api',
        is_primary: false,
      }),
    )
    expect(api.projects.repositories.list).toHaveBeenCalledTimes(2)
  })
})
