// Project service — business logic for projects and repositories

import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getRepositoriesForProject,
  getRepositoryById,
  getPrimaryRepository,
  createRepository,
  updateRepository,
  deleteRepository,
} from '../db/index'
import { logProjectCreated, logProjectUpdated, logProjectDeleted } from './activity.service'
import type { Project, Repository, Task } from '@taia/types'

// === Projects ===

export async function listProjects(workspaceId?: string): Promise<Project[]> {
  return getAllProjects(workspaceId)
}

export async function getProject(id: string): Promise<Project | undefined> {
  return getProjectById(id)
}

export async function createNewProject(data: {
  name: string
  description?: string
  workspace_id?: string
}): Promise<Project> {
  const project = await createProject(data)

  // Log activity
  await logProjectCreated(project)

  return project
}

export async function updateExistingProject(
  id: string,
  updates: Partial<Pick<Project, 'name' | 'description'>>,
): Promise<Project | null> {
  // Get before state
  const before = await getProjectById(id)
  if (!before) return null

  const project = await updateProject(id, updates)
  if (!project) return null

  // Log activity with changes
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  if (updates.name && updates.name !== before.name) {
    changes.name = { from: before.name, to: updates.name }
  }
  if (updates.description !== undefined && updates.description !== before.description) {
    changes.description = { from: before.description, to: updates.description }
  }
  if (Object.keys(changes).length > 0) {
    await logProjectUpdated(project, changes)
  }

  return project
}

export async function deleteExistingProject(id: string): Promise<boolean> {
  // Get project info before deletion
  const project = await getProjectById(id)

  const result = await deleteProject(id)

  // Log activity
  if (result && project) {
    await logProjectDeleted(project.name, id)
  }

  return result
}

// === Repositories ===

export async function listRepositories(projectId: string): Promise<Repository[]> {
  return getRepositoriesForProject(projectId)
}

export async function getRepo(id: string): Promise<Repository | undefined> {
  return getRepositoryById(id)
}

export async function createNewRepository(data: {
  project_id: string
  name: string
  url: string
  is_primary?: boolean
}): Promise<Repository> {
  return createRepository(data)
}

export async function updateExistingRepository(
  id: string,
  updates: Partial<Pick<Repository, 'name' | 'url' | 'is_primary'>>,
): Promise<Repository | null> {
  return updateRepository(id, updates)
}

export async function deleteExistingRepository(id: string): Promise<boolean> {
  return deleteRepository(id)
}

// === Helpers ===

export async function resolveRepoUrl(task: Task): Promise<string | null> {
  if (task.repo_url) return task.repo_url
  if (task.project_id) {
    const repo = await getPrimaryRepository(task.project_id)
    return repo?.url || null
  }
  return null
}
