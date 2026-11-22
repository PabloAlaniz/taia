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
  getAllTasks,
  getAllWorkspaces,
  getColumnsForWorkspace,
} from '../db/index'
import { logProjectCreated, logProjectUpdated, logProjectDeleted } from './activity.service'
import type { Project, ProjectOverview, Repository, Task } from '@taia/types'

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

// === Overview ===

/**
 * Everything a project spans: its tasks grouped by the workspace (flow) they
 * live in. Undefined when the project does not exist.
 */
export async function getProjectOverview(projectId: string): Promise<ProjectOverview | undefined> {
  const project = await getProjectById(projectId)
  if (!project) return undefined

  const [repositories, allTasks, workspaces] = await Promise.all([
    getRepositoriesForProject(projectId),
    getAllTasks(),
    getAllWorkspaces(),
  ])

  const tasksByWorkspace = new Map<string, Task[]>()
  for (const task of allTasks) {
    if (task.project_id !== projectId) continue
    const wsId = task.workspace_id ?? 'ws-default'
    const list = tasksByWorkspace.get(wsId) ?? []
    list.push(task)
    tasksByWorkspace.set(wsId, list)
  }

  const groups = await Promise.all(
    workspaces
      .filter((ws) => tasksByWorkspace.has(ws.id))
      .map(async (ws) => ({
        workspace: { id: ws.id, name: ws.name, icon: ws.icon, color: ws.color },
        columns: await getColumnsForWorkspace(ws.id),
        tasks: tasksByWorkspace.get(ws.id) ?? [],
      })),
  )
  groups.sort((a, b) => a.workspace.name.localeCompare(b.workspace.name))

  return { project, repositories, workspaces: groups }
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
