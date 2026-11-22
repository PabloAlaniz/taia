// Context service — builds AgentContextBundle from the agent_context store.
// Read-only: identities are written by agent-context.service.
//
// Reading order:
//   1. agent_context row with an identity → read pinned versions from the
//      *_versions tables.
//   2. No identity → return null. The adapter falls back to its default
//      (per-agent system prompt or adapter-level default).
//
// Project resolution (projects cut across workspaces, so the task decides):
//   1. The current task's project: the agent's pinned version if it belongs
//      to that project, else the project row (glossary and knowledge refs
//      are synced into it by saveProjectContext).
//   2. No task project → agent_context.project_context_version_id.
//   3. Else the agent's `project_id`, read via getProjectByIdFull.
//   4. Else the default workspace as a stand-in, else a static default.
//
// User resolution:
//   - If agent_context.user_profile_version_id is set, use that version.
//   - Else, the latest user_profile_versions row for 'default'.
//   - Else, a static singleton.
//
// See apps/docs/src/content/docs/arquitectura/modelo-de-contexto.md for the layer → table mapping.

import type {
  AgentContextBundle,
  ArchivalRef,
  ProjectContext,
  TaskBriefing,
  UserProfile,
} from '@taia/types'

import {
  getAgentById,
  getActiveWorktreeForTask,
  getAgentContext,
  getAgentIdentityVersion,
  getAgentWorkingState,
  getAllTasks,
  getDefaultWorkspace,
  getLatestUserProfileVersion,
  getProjectByIdFull,
  getProjectContextVersion,
  getUserProfileVersion,
  listAgentMemories,
} from '../db/index'
const DEFAULT_USER_ID = 'default'

const DEFAULT_USER: UserProfile = {
  id: DEFAULT_USER_ID,
  displayName: 'TAIA user',
}

const DEFAULT_PROJECT: ProjectContext = {
  name: 'TAIA',
  description: 'Default project.',
}

/**
 * Build the bundle for `agentId`. Returns null when there is nothing to feed
 * the model with (no agent row or no typed identity). Read-only: never writes.
 */
export async function loadAgentContextBundle(agentId: string): Promise<AgentContextBundle | null> {
  const agent = await getAgentById(agentId)
  if (!agent) return null

  // 1. Context pointers. Agents without a typed identity get no bundle; the
  //    adapter falls back.
  const ctx = await getAgentContext(agentId)

  // 2. Identity — read the pinned version's content.
  const identityVersionId = ctx?.agent_identity_version_id
  const identityRow = identityVersionId ? await getAgentIdentityVersion(identityVersionId) : null
  if (!identityRow) return null
  const identity = identityRow.content

  // 3. Task — the in-progress task (else the most recent one), the agent's
  //    progress notes and the task's active worktree. Not versioned. Read
  //    before the project: the task's project decides the project layer.
  const [workingRow, allTasks, memories] = await Promise.all([
    getAgentWorkingState(agentId),
    getAllTasks(),
    listAgentMemories(agentId),
  ])
  const working = workingRow?.content
  const myTasks = allTasks.filter((t) => t.assigned_to === agentId)
  const inProgress = myTasks.find((t) => t.status === 'IN_PROGRESS')
  const candidate = inProgress ?? myTasks[0]
  const worktree = candidate ? await getActiveWorktreeForTask(candidate.id) : undefined
  const task: TaskBriefing = candidate
    ? {
        taskId: candidate.id,
        title: candidate.title,
        description: candidate.description ?? '',
        priority: candidate.priority,
        status: candidate.status,
        deadline: candidate.due_date,
        workingState: working || undefined,
        ...(worktree?.worktree_path
          ? {
              workspace: {
                path: worktree.worktree_path,
                branch: worktree.branch_name,
                baseBranch: worktree.base_branch,
              },
            }
          : {}),
      }
    : {
        title: 'Heartbeat',
        description:
          'No task currently assigned. Check the task list and pick up anything available, or report status.',
        priority: 'MEDIUM',
        status: 'INBOX',
        workingState: working || undefined,
      }

  // 4. Project — the task's project, then the agent's pin / project_id.
  const project = await resolveProjectContext(
    candidate?.project_id ?? null,
    ctx?.project_context_version_id ?? null,
    agent,
  )

  // 5. User — pinned version, then latest 'default' version, then singleton.
  const user = await resolveUserProfile(ctx?.user_profile_version_id ?? null)

  const archival: ArchivalRef[] = memories.map((m) => ({ uri: m.path }))

  return {
    agent: identity,
    project,
    user,
    task,
    memory: {
      recall: [],
      archival,
      working: {},
    },
  }
}

async function resolveProjectContext(
  taskProjectId: string | null,
  pinnedVersionId: string | null,
  agent: { project_id?: string | null },
): Promise<ProjectContext> {
  const pinned = pinnedVersionId ? await getProjectContextVersion(pinnedVersionId) : null

  if (taskProjectId) {
    // An explicit pin still wins when it is a version of the task's project.
    if (pinned && pinned.project_id === taskProjectId) return pinned.content
    const fromTask = await readProject(taskProjectId)
    if (fromTask) return fromTask
  }
  if (pinned) return pinned.content

  const projectId = agent.project_id ?? null
  if (projectId) {
    const project = await readProject(projectId)
    if (project) return project
  }
  const workspace = await getDefaultWorkspace()
  if (workspace) {
    return {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description ?? DEFAULT_PROJECT.description,
    }
  }
  return DEFAULT_PROJECT
}

/** A project row shaped as a ProjectContext; undefined if it does not exist. */
async function readProject(projectId: string): Promise<ProjectContext | undefined> {
  const project = await getProjectByIdFull(projectId)
  if (!project) return undefined
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? DEFAULT_PROJECT.description,
    glossary: project.glossary ?? undefined,
    knowledgeRefs: project.knowledge_refs ?? undefined,
  }
}

async function resolveUserProfile(versionId: string | null): Promise<UserProfile> {
  if (versionId) {
    const v = await getUserProfileVersion(versionId)
    if (v) return v.content
  }
  const latest = await getLatestUserProfileVersion(DEFAULT_USER_ID)
  if (latest) return latest.content
  return DEFAULT_USER
}

/** Which parts of an agent's context are filled in (shown on agent cards). */
export interface AgentContextSummary {
  /** Has a persona. */
  persona: boolean
  /** Has working instructions. */
  instructions: boolean
  /** Has progress notes in its working state. */
  workingNotes: boolean
  /** Memory file names under /memories/. */
  memoryFiles: string[]
}

export async function getAgentContextSummary(agentId: string): Promise<AgentContextSummary> {
  const [ctx, working, memories] = await Promise.all([
    getAgentContext(agentId),
    getAgentWorkingState(agentId),
    listAgentMemories(agentId, { pathPrefix: '/memories/' }),
  ])
  const identity = ctx?.agent_identity_version_id
    ? (await getAgentIdentityVersion(ctx.agent_identity_version_id))?.content
    : undefined
  return {
    persona: Boolean(identity?.persona?.trim()),
    instructions: Boolean(identity?.instructions?.trim()),
    workingNotes: Boolean(working?.content.trim()),
    memoryFiles: memories.map((m) => m.path.slice('/memories/'.length)),
  }
}
