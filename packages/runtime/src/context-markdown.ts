// Markdown sections shared by the context renderers. Each adapter decides
// where a section goes (system blocks for Anthropic, workspace files for
// OpenClaw, one prompt for CLI agents); the wording lives here so every
// runtime tells the agent the same thing.
//
// Reference: docs/adr/005-runtime-owned-context-and-settings.md

import type { AgentContextBundle, AgentIdentity, ProjectContext, UserProfile } from '@taia/types'
import type { SpawnTrigger } from './types'

/** Reply an agent gives when a heartbeat finds nothing to do. */
export const HEARTBEAT_OK = 'HEARTBEAT_OK'

/** The agent identity layer: who it is, how it works, hard rules. */
export function renderAgentIdentity(agent: AgentIdentity): string {
  const lines: string[] = [`# Identity`, ``, `You are **${agent.name}** — ${agent.role}.`, ``]
  if (agent.persona.trim().length > 0) {
    lines.push(`## Persona`, ``, agent.persona.trim(), ``)
  }
  if (agent.instructions.trim().length > 0) {
    lines.push(`## How you work`, ``, agent.instructions.trim(), ``)
  }
  if (agent.constraints && agent.constraints.length > 0) {
    lines.push(`## Constraints`, ``)
    for (const c of agent.constraints) lines.push(`- ${c}`)
    lines.push(``)
  }
  return lines.join('\n').trimEnd()
}

/** The project layer. Glossary and knowledge refs flatten to bullet lists. */
export function renderProjectContext(project: ProjectContext): string {
  const lines: string[] = [`# Project: ${project.name}`, ``, project.description.trim(), ``]
  if (project.glossary && Object.keys(project.glossary).length > 0) {
    lines.push(`## Glossary`, ``)
    for (const [term, definition] of Object.entries(project.glossary)) {
      lines.push(`- **${term}**: ${definition}`)
    }
    lines.push(``)
  }
  if (project.knowledgeRefs && project.knowledgeRefs.length > 0) {
    lines.push(`## Knowledge`, ``)
    for (const ref of project.knowledgeRefs) {
      lines.push(`- [${ref.kind}] ${ref.uri} — ${ref.description}`)
    }
    lines.push(``)
  }
  return lines.join('\n').trimEnd()
}

/** The user-profile layer: facts, preferences and things to never do. */
export function renderUserProfile(user: UserProfile): string {
  const lines: string[] = [`# User: ${user.displayName}`, ``]
  if (user.facts && user.facts.length > 0) {
    lines.push(`## Facts`, ``)
    for (const f of user.facts) lines.push(`- ${f}`)
    lines.push(``)
  }
  if (user.preferences && Object.keys(user.preferences).length > 0) {
    lines.push(`## Preferences`, ``)
    for (const [k, v] of Object.entries(user.preferences)) {
      lines.push(`- **${k}**: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    }
    lines.push(``)
  }
  if (user.doNotDo && user.doNotDo.length > 0) {
    lines.push(`## Do NOT`, ``)
    for (const d of user.doNotDo) lines.push(`- ${d}`)
    lines.push(``)
  }
  return lines.join('\n').trimEnd()
}

/**
 * The task layer: status, priority, expected output, the worktree to work
 * in and the agent's own progress notes.
 */
export function renderTaskBriefing(bundle: AgentContextBundle): string {
  const { task } = bundle
  const lines: string[] = [
    `# Task: ${task.title}`,
    ``,
    `- Status: ${task.status}`,
    `- Priority: ${task.priority}`,
  ]
  if (task.deadline) lines.push(`- Deadline: ${task.deadline}`)
  if (task.taskId) lines.push(`- Task ID: ${task.taskId}`)
  if (task.dependencies && task.dependencies.length > 0) {
    lines.push(`- Depends on: ${task.dependencies.join(', ')}`)
  }
  lines.push(``, `## Description`, ``, task.description.trim() || '(none provided)', ``)
  if (task.expectedOutput) {
    lines.push(`## Expected output`, ``, task.expectedOutput.trim(), ``)
  }
  if (task.workspace) {
    lines.push(
      `## Workspace`,
      ``,
      `Work in the git worktree at \`${task.workspace.path}\` on branch \`${task.workspace.branch}\`` +
        (task.workspace.baseBranch ? ` (based on \`${task.workspace.baseBranch}\`).` : '.'),
      ``,
    )
  }
  if (task.workingState && task.workingState.trim().length > 0) {
    lines.push(`## Current working state`, ``, task.workingState.trim(), ``)
  }
  return lines.join('\n').trimEnd()
}

/**
 * The first message of a session, phrased from why it starts. A heartbeat
 * asks the agent to check its work (with the current task, if any); a task
 * run gets the briefing; a free-form prompt is passed through unchanged.
 * Without a trigger the briefing is used, as before triggers existed.
 */
export function renderKickoff(
  bundle: AgentContextBundle,
  trigger: SpawnTrigger | undefined,
  prompt: string,
): string {
  if (trigger?.kind === 'prompt') return prompt
  if (trigger?.kind === 'heartbeat') {
    const lines = [
      `# Heartbeat`,
      ``,
      `Check your assigned tasks and continue your work. ` +
        `If there is nothing to do, reply ${HEARTBEAT_OK}.`,
    ]
    if (bundle.task.taskId) lines.push(``, renderTaskBriefing(bundle))
    return lines.join('\n')
  }
  return renderTaskBriefing(bundle)
}

/**
 * How an agent without native TAIA tools reaches the board: the HTTP
 * endpoints for its tasks, notes and memory.
 */
export function renderTaiaApi(agentId: string, baseUrl: string): string {
  const api = `${baseUrl.replace(/\/+$/, '')}/api`
  return [
    `# TAIA board`,
    ``,
    `Your tasks live on the TAIA board. Use its HTTP API:`,
    ``,
    `- \`GET ${api}/tasks?assigned_to=${agentId}\` — your assigned tasks`,
    `- \`PATCH ${api}/tasks/{taskId}\` — update a task's status and notes`,
    `- \`GET ${api}/agents/${agentId}/working-state\` / \`PUT\` with \`{"content": "..."}\` — your progress notes between runs`,
    `- \`GET ${api}/agents/${agentId}/memory\` and \`GET|PUT ${api}/agents/${agentId}/memory/{name}\` — your memory files`,
    ``,
    `Always leave a short note on the task describing what you did.`,
  ].join('\n')
}
