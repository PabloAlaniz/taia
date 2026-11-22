import { z } from 'zod'
import type { ToolDefinition } from '../tool-registry'
import {
  listProjects,
  createNewProject,
  updateExistingProject,
  deleteExistingProject,
} from '@taia/core/services/project.service'

export const listProjectsTool: ToolDefinition = {
  name: 'taia_list_projects',
  description:
    'List projects. Projects cut across workspaces: a project groups the tasks for one client or product, whatever workspace (flow) they live in. Pass workspaceId to list only the projects used in that workspace.',
  params: {
    workspaceId: z
      .string()
      .optional()
      .describe('Only projects with tasks in this workspace (or created there)'),
  },
  handler: async ({ workspaceId }) => {
    const projects = await listProjects(workspaceId)
    return {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
      })),
    }
  },
}

export const createProjectTool: ToolDefinition = {
  name: 'taia_create_project',
  description:
    'Create a new project. A project holds the context (description, glossary, repositories) that agents get when working any of its tasks, in any workspace.',
  params: {
    name: z.string().describe('Project name'),
    description: z.string().optional().describe('Project description'),
  },
  handler: async ({ name, description }) => {
    const project = await createNewProject({ name, description })
    return { created: true, project }
  },
}

export const updateProjectTool: ToolDefinition = {
  name: 'taia_update_project',
  description: 'Update an existing project',
  params: {
    projectId: z.string().describe('The project ID to update'),
    name: z.string().optional().describe('New project name'),
    description: z.string().optional().describe('New project description'),
  },
  handler: async ({ projectId, ...updates }) => {
    const project = await updateExistingProject(projectId, updates)
    if (!project) throw new Error(`Project ${projectId} not found`)
    return { updated: true, project }
  },
}

export const deleteProjectTool: ToolDefinition = {
  name: 'taia_delete_project',
  description: 'Delete a project by ID',
  params: {
    projectId: z.string().describe('The project ID to delete'),
  },
  handler: async ({ projectId }) => {
    await deleteExistingProject(projectId)
    return { deleted: true }
  },
}

export const projectTools: ToolDefinition[] = [
  listProjectsTool,
  createProjectTool,
  updateProjectTool,
  deleteProjectTool,
]
