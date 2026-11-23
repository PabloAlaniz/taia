import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirect = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ redirect }))

import ProjectsSettingsRedirect from '@/app/settings/projects/page'

beforeEach(() => redirect.mockReset())

describe('/settings/projects', () => {
  it('sends old links to the projects list', async () => {
    await ProjectsSettingsRedirect({ searchParams: Promise.resolve({}) })
    expect(redirect).toHaveBeenCalledWith('/projects')
  })

  it("sends ?project= to that project's settings", async () => {
    await ProjectsSettingsRedirect({ searchParams: Promise.resolve({ project: 'p 1' }) })
    expect(redirect).toHaveBeenCalledWith('/projects/p%201/settings')
  })
})
