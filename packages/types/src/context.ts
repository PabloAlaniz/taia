// Agent context — typed primitives consumed by every runtime adapter.
//
// The bundle is the runtime-agnostic representation of "everything the agent
// needs to know". Each adapter implements an AgentContextRenderer that
// translates it to the runtime's native shape (Anthropic Messages blocks,
// OpenAI Assistant config, OpenClaw markdown projection, etc).
//
// Justification: docs/adr/003-agent-context-bundle.md
// Reference: apps/docs/src/content/docs/arquitectura/modelo-de-contexto.md

import type { TaskPriority, TaskStatus } from './domain'

/** Closed enum — TypeScript validates capability strings at the call site. */
export type AgentCapability =
  | 'read_tasks'
  | 'write_tasks'
  | 'comment_tasks'
  | 'read_stats'
  /** Read the agent's own identity, instructions and working notes. */
  | 'read_own_files'
  | 'memory'

/** Pointer to project knowledge — content is loaded by the renderer when relevant. */
export interface KnowledgeRef {
  kind: 'url' | 'doc' | 'vector_store' | 'file'
  uri: string
  description: string
  /** Whether the renderer can place this in a cacheable block. Stable URIs ideally are; a Slack thread linked at runtime is not. */
  cacheable: boolean
}

/** Layer 1 — who the agent is. Persona + instructions are markdown. */
export interface AgentIdentity {
  id: string
  name: string
  role: string
  /** Stable backstory / tone / values. Cacheable across runs. */
  persona: string
  /** How the agent works. Edited more often than persona. */
  instructions: string
  capabilities: AgentCapability[]
  /** Hard limits — "never X", "always ask before Y". */
  constraints?: string[]
}

/** Layer 2 — what the agent knows about the domain. */
export interface ProjectContext {
  /** Optional: older contexts may not reference a `projects` row. */
  id?: string
  name: string
  description: string
  glossary?: Record<string, string>
  knowledgeRefs?: KnowledgeRef[]
}

/** Layer 3 — who the agent is talking to. */
export interface UserProfile {
  id: string
  displayName: string
  preferences?: Record<string, unknown>
  facts?: string[]
  doNotDo?: string[]
}

/** Git worktree the task runs in, when it has one. */
export interface TaskWorkspace {
  path: string
  branch: string
  baseBranch?: string
}

/** Layer 4 — what the agent is doing right now. Derived from `tasks`, worktrees and working state. */
export interface TaskBriefing {
  /** FK to `tasks.id` when the briefing comes from an actual task row. */
  taskId?: string
  title: string
  description: string
  /** What "done" looks like — borrowed from CrewAI. Helps the model self-check. */
  expectedOutput?: string
  priority: TaskPriority
  status: TaskStatus
  dependencies?: string[]
  /** Partial progress notes the agent keeps between runs (formerly WORKING.md). */
  workingState?: string
  /** Isolated worktree for this task, so renderers can tell the agent where to work. */
  workspace?: TaskWorkspace
  deadline?: string
}

/** A single conversational turn from a prior session, replayed as recall. */
export interface RecallEntry {
  role: 'user' | 'assistant'
  /** Raw text or content array (provider-shaped — adapter normalizes). */
  content: unknown
  timestamp?: string
}

/** Pointer to archival memory (filesystem-like or semantic). Content fetched on demand. */
export interface ArchivalRef {
  /** Path or identifier within the archival store (today: agent_memory.path). */
  uri: string
  /** Short summary so the model decides whether to fetch — kept in the prompt, content is not. */
  summary?: string
}

/** Layer 5 — what happened before. Three tiers (Letta-inspired). */
export interface SessionMemory {
  /** Recent conversation history, in order. */
  recall: RecallEntry[]
  /** Long-lived memories the agent maintains. Refs only; content fetched on demand. */
  archival: ArchivalRef[]
  /** Mutable KV scoped to the current run. Not persisted between runs. */
  working: Record<string, unknown>
}

/**
 * The complete context bundle for a single spawn. Every adapter knows how
 * to consume it. Every layer has a well-defined editor and lifecycle —
 * see ADR-003 for the rationale.
 */
export interface AgentContextBundle {
  agent: AgentIdentity
  project: ProjectContext
  user: UserProfile
  task: TaskBriefing
  memory: SessionMemory
}
