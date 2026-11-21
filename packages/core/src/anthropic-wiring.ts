// Wiring for the AnthropicAdapter — implements the RuntimeSessionStore over
// the runtime-session repository, and the ToolExecutor over HTTP fetches to
// TAIA's own REST API.
//
// This file is the only place in @taia/core that imports from
// @taia/runtime/adapters/anthropic. It registers the factory once at module
// import; runtime.ts pulls it in.

import { config } from './config'
import {
  appendRuntimeMessage,
  createAgentMemory,
  createApprovalRequest,
  createRuntimeSession,
  deleteAgentMemory,
  getAgentContext,
  getAgentIdentityVersion,
  getAgentMemory,
  getAgentWorkingState,
  getApprovalRequest,
  getRuntimeMessages,
  getRuntimeSession,
  listAgentMemories,
  listRuntimeSessions,
  renameAgentMemory,
  type RuntimeSessionRow,
  updateAgentMemoryContent,
  updateRuntimeSession,
} from './db/index'
import {
  type AgentContextResolver,
  type ApprovalStore,
  registerAnthropicFactory,
  type RuntimeSessionRecord,
  type RuntimeSessionStore,
  type ToolExecutor,
  type ToolExecutorContext,
} from '@taia/runtime/adapters/anthropic'
import { DEFAULT_CLAUDE_MODEL } from '@taia/runtime/models'
import { instanceIdOf } from '@taia/runtime'
import { loadAgentContextBundle } from './services/context.service'
import { internalAuthHeaders } from './auth'

const PROVIDER = 'anthropic'

// --- Store implementation backed by the runtime_sessions / runtime_messages tables ---

/** Sessions of one Anthropic instance (`runtime_sessions.instance_id`). */
function sessionStoreFor(instanceId: string): RuntimeSessionStore {
  return {
    async createSession(input) {
      await createRuntimeSession({
        session_key: input.sessionKey,
        agent_id: input.agentId,
        provider: PROVIDER,
        instance_id: instanceId,
        run_id: input.runId,
        model: input.model,
        label: input.label,
        metadata: input.metadata,
        bundle_version_ids: input.bundleVersionIds,
      })
    },

    async getSession(sessionKey) {
      const row = await getRuntimeSession(sessionKey)
      return row ? rowToRecord(row) : null
    },

    async updateSession(sessionKey, updates) {
      await updateRuntimeSession(sessionKey, {
        status: updates.status,
        stop_reason: updates.stopReason ?? undefined,
        total_tokens: updates.totalTokens,
        input_tokens: updates.inputTokens,
        output_tokens: updates.outputTokens,
        cache_creation_input_tokens: updates.cacheCreationInputTokens,
        cache_read_input_tokens: updates.cacheReadInputTokens,
        duration_ms: updates.durationMs,
      })
    },

    async listSessions(options) {
      const rows = await listRuntimeSessions({
        instanceId,
        agentId: options?.agentId,
        limit: options?.limit,
        activeMinutes: options?.activeMinutes,
      })
      return rows.map(rowToRecord)
    },

    async appendMessage(input) {
      await appendRuntimeMessage({
        session_key: input.sessionKey,
        role: input.role,
        content: input.content,
        model: input.model,
        stop_reason: input.stopReason,
      })
    },

    async getMessages(sessionKey, options) {
      const rows = await getRuntimeMessages(sessionKey, options)
      return rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        model: r.model || undefined,
        stopReason: r.stop_reason || undefined,
        timestamp: r.created_at,
      }))
    },
  }
}

function rowToRecord(row: RuntimeSessionRow): RuntimeSessionRecord {
  return {
    sessionKey: row.session_key,
    agentId: row.agent_id,
    provider: row.provider,
    runId: row.run_id,
    model: row.model,
    status: row.status,
    stopReason: row.stop_reason,
    label: row.label,
    totalTokens: row.total_tokens,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheCreationInputTokens: row.cache_creation_input_tokens,
    cacheReadInputTokens: row.cache_read_input_tokens,
    durationMs: row.duration_ms,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// --- Tool executor: HTTP fetch into TAIA's own REST API ---

interface ToolDescriptor {
  endpoint: (input: Record<string, unknown>) => string
  method: 'GET' | 'POST' | 'PATCH'
  body?: (input: Record<string, unknown>) => Record<string, unknown> | undefined
}

const TOOL_ROUTES: Record<string, ToolDescriptor> = {
  taia_tasks_list: {
    method: 'GET',
    endpoint: (input) => {
      const params = new URLSearchParams()
      if (input.assigned_to) params.set('assigned_to', String(input.assigned_to))
      if (input.status) params.set('status', String(input.status))
      if (input.project_id) params.set('project_id', String(input.project_id))
      if (Array.isArray(input.tags)) {
        for (const t of input.tags) params.append('tag', String(t))
      }
      if (input.limit) params.set('limit', String(input.limit))
      const qs = params.toString()
      return `/api/tasks${qs ? `?${qs}` : ''}`
    },
  },
  taia_tasks_get: {
    method: 'GET',
    endpoint: (input) => `/api/tasks/${encodeURIComponent(String(input.task_id))}`,
  },
  taia_tasks_create: {
    method: 'POST',
    endpoint: () => `/api/tasks`,
    body: (input) => input,
  },
  taia_tasks_update: {
    method: 'PATCH',
    endpoint: (input) => `/api/tasks/${encodeURIComponent(String(input.task_id))}`,
    body: (input) => {
      const { task_id: _, ...rest } = input
      return rest
    },
  },
  taia_tasks_comment: {
    method: 'POST',
    endpoint: (input) => `/api/tasks/${encodeURIComponent(String(input.task_id))}/messages`,
    body: (input) => ({ content: input.content, mentions: input.mentions }),
  },
  taia_stats_get: {
    method: 'GET',
    endpoint: (input) => {
      const period = input.period ? `?period=${encodeURIComponent(String(input.period))}` : ''
      return `/api/cost/dashboard${period}`
    },
  },
}

/** Tool executor whose TAIA tools call the REST API at `baseUrl`. */
const toolExecutorFor =
  (baseUrl: string): ToolExecutor =>
  async (toolName, toolInput, context) => {
    // Anthropic memory tool — backed by the agent_memory table, scoped per agent.
    if (toolName === 'memory') {
      return executeMemoryCommand(toolInput, context)
    }

    // Agent's own context — direct DB read scoped by context.agentId.
    if (toolName === 'taia_agent_context_read') {
      return executeAgentContextRead(toolInput, context)
    }

    // TAIA-native tools — HTTP into TAIA's own REST API.
    const route = TOOL_ROUTES[toolName]
    if (!route) {
      return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }

    const url = `${baseUrl.replace(/\/$/, '')}${route.endpoint(toolInput)}`
    const init: RequestInit = {
      method: route.method,
      // The agent loop runs inside TAIA: it calls the API with the server's
      // own token when one is configured.
      headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
    }
    if (route.body) {
      const body = route.body(toolInput)
      if (body !== undefined) init.body = JSON.stringify(body)
    }

    try {
      const res = await fetch(url, init)
      const text = await res.text()
      if (!res.ok) {
        return JSON.stringify({
          error: `HTTP ${res.status}`,
          body: text.slice(0, 1000),
        })
      }
      // Truncate large responses to keep tool result size manageable.
      return text.length > 50_000 ? `${text.slice(0, 50_000)}\n…[truncated]` : text
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

// --- Agent context tool executor (taia_agent_context_read) ---
//
// Serves a section of the agent's own context from the typed stores
// (ADR-005): identity → persona and constraints, instructions → working
// instructions, working_notes → agent_working_state. Scoped by
// context.agentId so an agent can only read its own context. On miss,
// returns a structured error string the model can react to instead of
// throwing.

const CONTEXT_SECTIONS = ['identity', 'instructions', 'working_notes'] as const
type ContextSection = (typeof CONTEXT_SECTIONS)[number]

async function readAgentContextSection(
  agentId: string,
  section: ContextSection,
): Promise<string | null> {
  if (section === 'working_notes') {
    return (await getAgentWorkingState(agentId))?.content || null
  }

  const ctx = await getAgentContext(agentId)
  const version = ctx?.agent_identity_version_id
    ? await getAgentIdentityVersion(ctx.agent_identity_version_id)
    : null
  if (!version) return null
  const identity = version.content
  if (section === 'instructions') return identity.instructions || null

  const constraints = identity.constraints?.length
    ? `\n\n## Constraints\n\n${identity.constraints.map((c) => `- ${c}`).join('\n')}`
    : ''
  return `# ${identity.name} — ${identity.role}\n\n${identity.persona}${constraints}`.trim()
}

async function executeAgentContextRead(
  input: Record<string, unknown>,
  context: ToolExecutorContext,
): Promise<string> {
  const section = String(input.section || '').trim() as ContextSection
  if (!CONTEXT_SECTIONS.includes(section)) {
    return JSON.stringify({ error: 'invalid_section', expected: CONTEXT_SECTIONS })
  }
  try {
    const content = await readAgentContextSection(context.agentId, section)
    if (content === null) return JSON.stringify({ error: 'not_found', section })
    return content
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// --- Per-agent context resolver ---
//
// Hands the adapter the agent's typed context bundle; its renderer turns it
// into cached system blocks plus a task briefing. Returns null when the agent
// has no typed identity, so the adapter falls back to its default prompt.

const loadAgentContext: AgentContextResolver = async (agentId) => {
  try {
    const bundle = await loadAgentContextBundle(agentId)
    return bundle ? { bundle } : null
  } catch (err) {
    console.warn(
      `[anthropic-wiring] loadAgentContext failed for ${agentId}:`,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

// --- Memory tool executor (memory_20250818) ---
//
// Implements the 6 commands of the Anthropic memory tool over the
// agent_memory table. State is scoped by context.agentId so two agents in
// the same workspace can't read each other's memories.

async function executeMemoryCommand(
  input: Record<string, unknown>,
  context: ToolExecutorContext,
): Promise<string> {
  const command = String(input.command || '')
  const agentId = context.agentId

  try {
    switch (command) {
      case 'view': {
        const path = input.path ? String(input.path) : undefined
        if (!path || path === '/' || path.endsWith('/')) {
          // Directory view — list memories under the prefix.
          const prefix = path || '/'
          const memories = await listAgentMemories(agentId, { pathPrefix: prefix })
          if (memories.length === 0) return `(empty directory: ${prefix})`
          return memories.map((m) => `${m.path} (${m.content.length} bytes)`).join('\n')
        }
        // File view — return content.
        const memory = await getAgentMemory(agentId, path)
        if (!memory) return JSON.stringify({ error: 'not_found', path })
        return memory.content
      }

      case 'create': {
        const path = String(input.path || '')
        const fileText = String(input.file_text || '')
        if (!path) return JSON.stringify({ error: 'missing path' })
        const existing = await getAgentMemory(agentId, path)
        if (existing) {
          return JSON.stringify({ error: 'path_conflict', path })
        }
        await createAgentMemory({ agentId, path, content: fileText })
        return JSON.stringify({ ok: true, path })
      }

      case 'str_replace': {
        const path = String(input.path || '')
        const oldStr = String(input.old_str || '')
        const newStr = String(input.new_str || '')
        const memory = await getAgentMemory(agentId, path)
        if (!memory) return JSON.stringify({ error: 'not_found', path })
        if (!memory.content.includes(oldStr)) {
          return JSON.stringify({ error: 'old_str_not_found', path })
        }
        const updated = memory.content.replace(oldStr, newStr)
        await updateAgentMemoryContent(agentId, path, updated)
        return JSON.stringify({ ok: true, path })
      }

      case 'insert': {
        const path = String(input.path || '')
        const insertLine = Number(input.insert_line)
        const insertText = String(input.insert_text || '')
        const memory = await getAgentMemory(agentId, path)
        if (!memory) return JSON.stringify({ error: 'not_found', path })
        const lines = memory.content.split('\n')
        const idx = Math.max(0, Math.min(insertLine, lines.length))
        lines.splice(idx, 0, insertText)
        await updateAgentMemoryContent(agentId, path, lines.join('\n'))
        return JSON.stringify({ ok: true, path })
      }

      case 'delete': {
        const path = String(input.path || '')
        const removed = await deleteAgentMemory(agentId, path)
        if (!removed) return JSON.stringify({ error: 'not_found', path })
        return JSON.stringify({ ok: true, path })
      }

      case 'rename': {
        const oldPath = String(input.old_path || input.path || '')
        const newPath = String(input.new_path || '')
        if (!oldPath || !newPath) return JSON.stringify({ error: 'missing path' })
        const conflict = await getAgentMemory(agentId, newPath)
        if (conflict) return JSON.stringify({ error: 'path_conflict', path: newPath })
        const renamed = await renameAgentMemory(agentId, oldPath, newPath)
        if (!renamed) return JSON.stringify({ error: 'not_found', path: oldPath })
        return JSON.stringify({ ok: true, old_path: oldPath, new_path: newPath })
      }

      default:
        return JSON.stringify({ error: 'unknown_command', command })
    }
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// --- Approval store ---
//
// Concrete ApprovalStore over the approval_requests table. Polling-based:
// `untilDecided` polls every 1.5s until the row leaves 'pending' or the
// caller-supplied timeoutMs is reached. The polling cadence is conservative
// — approvals are typically human-driven, so a 1.5s loop is well below
// expected decision latency and well above DB cost.

const APPROVAL_POLL_INTERVAL_MS = 1500

const approvalStore: ApprovalStore = {
  async createPending(input) {
    const row = await createApprovalRequest({
      session_key: input.sessionKey,
      agent_id: input.agentId,
      tool_name: input.toolName,
      tool_use_id: input.toolUseId,
      tool_input: input.toolInput,
    })
    return { id: row.id }
  },

  async untilDecided(approvalId, options) {
    const deadline = Date.now() + options.timeoutMs
    while (Date.now() < deadline) {
      const row = await getApprovalRequest(approvalId)
      if (!row) {
        return { decision: 'rejected', reason: 'approval_request_missing' }
      }
      if (row.status !== 'pending') {
        if (row.status === 'approved') return { decision: 'approved' }
        if (row.status === 'rejected') {
          return { decision: 'rejected', reason: row.decision_reason || undefined }
        }
        return { decision: 'timed_out' }
      }
      await new Promise((r) => setTimeout(r, APPROVAL_POLL_INTERVAL_MS))
    }
    return { decision: 'timed_out' }
  },
}

// --- Register the factory ---

let registered = false

export function ensureAnthropicFactoryRegistered(): void {
  if (registered) return
  registered = true
  registerAnthropicFactory({
    store: (cfg) => sessionStoreFor(instanceIdOf(cfg)),
    executeTool: (cfg) => toolExecutorFor(cfg.taiaBaseUrl || config.taia.url),
    defaultModel: DEFAULT_CLAUDE_MODEL,
    // Memory tool ON by default. The model decides when/whether
    // to call it; we just pay schema overhead in the request prefix
    // (which is cached, so the cost is negligible after warm-up).
    enableMemory: true,
    // Approvals ON, but with an empty allowlist by default — no
    // tool actually triggers an approval until a deployment opts a tool in
    // (typically via runtime.providers.anthropic.needs_approval_tools, a
    // future setting; today the list is hardcoded empty and existing tools
    // run without approval gating). This way the capability is declared
    // and the API endpoints work, without changing default behavior.
    enableApprovals: true,
    needsApprovalTools: [],
    approvalStore,
    // Per-agent context bundle (identity, project, user, task, memory).
    // Without it every agent would arrive at Anthropic with no identity and
    // no instructions — see ADR-003 / ADR-005.
    getAgentContext: loadAgentContext,
  })
}

ensureAnthropicFactoryRegistered()
