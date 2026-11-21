// TAIA-native tools exposed to Anthropic agents.
//
// Each tool wraps an existing TAIA REST endpoint. Tool execution (the actual
// HTTP fetch) is injected into the adapter via the ToolExecutor callback —
// this file only defines schemas.
//
// Adapter consumers can restrict which tools an agent has access to via
// `allowedTools` in AnthropicAdapterOptions. Default: all tools enabled.

import type Anthropic from '@anthropic-ai/sdk'

export const TAIA_TOOLS: Anthropic.Tool[] = [
  {
    name: 'taia_tasks_list',
    description:
      'List tasks in TAIA, optionally filtered by status, assignee, project, or tags. ' +
      'Use this to discover what work is queued, in progress, or done. ' +
      'Returns at most `limit` tasks (default 50, max 200).',
    input_schema: {
      type: 'object',
      properties: {
        assigned_to: {
          type: 'string',
          description: 'Filter by assigned agent ID (e.g. "alex")',
        },
        status: {
          type: 'string',
          description: 'Filter by status slug (e.g. "INBOX", "IN_PROGRESS", "REVIEW", "DONE")',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by one or more tags (case-sensitive)',
        },
        project_id: {
          type: 'string',
          description: 'Filter by project ID',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Max tasks to return (default 50)',
        },
      },
    },
  },
  {
    name: 'taia_tasks_get',
    description:
      'Fetch a single task by ID, including its subtasks, dependencies, and recent comments. ' +
      'Use this when you need full context about one task.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task ID' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'taia_tasks_create',
    description:
      'Create a new task in TAIA. Required: title. Optional: description, priority, assigned_to, tags, project_id. ' +
      'Returns the created task ID.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title (required)' },
        description: { type: 'string', description: 'Detailed description' },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
          description: 'Priority level (default MEDIUM)',
        },
        assigned_to: {
          type: 'string',
          description: 'Agent ID to assign the task to',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to attach (e.g. ["backend", "auth"])',
        },
        project_id: { type: 'string', description: 'Project ID' },
        status: {
          type: 'string',
          description: 'Initial status slug (defaults to the workspace inbox column)',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'taia_tasks_update',
    description:
      'Update fields on an existing task. Use this to change status, reassign, ' +
      'add notes, modify priority, or update tags. Pass only the fields you want to change.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task ID (required)' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
        assigned_to: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'taia_tasks_comment',
    description:
      'Add a comment / message to a task. Use this to record progress notes, ' +
      'questions for other agents, or status updates. Mentions ("@agent-id") notify the named agent.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task ID' },
        content: { type: 'string', description: 'The comment text' },
        mentions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Agent IDs to notify',
        },
      },
      required: ['task_id', 'content'],
    },
  },
  {
    name: 'taia_stats_get',
    description:
      'Read TAIA dashboard metrics: total tasks, completion rate, cost dashboard, ' +
      'agents activity. Useful for status reports or analyzing team throughput. ' +
      'Optional period: "24h", "week", "month".',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['24h', 'week', 'month'],
          description: 'Time window (defaults to all time)',
        },
      },
    },
  },
  {
    name: 'taia_agent_context_read',
    description:
      'Read part of your own context as TAIA stores it now: your identity (role, persona, ' +
      'constraints), your working instructions, or your working notes between runs. Use it ' +
      'when you need the latest version instead of what your system prompt carried at the ' +
      'start of the run. Your memories are read with the memory tool.',
    input_schema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: ['identity', 'instructions', 'working_notes'],
          description: 'Which part of your context to read.',
        },
      },
      required: ['section'],
    },
  },
]

export function filterTools(tools: Anthropic.Tool[], allowedNames?: string[]): Anthropic.Tool[] {
  if (!allowedNames || allowedNames.length === 0) return tools
  const allow = new Set(allowedNames)
  return tools.filter((t) => allow.has(t.name))
}

/**
 * Anthropic memory tool definition (memory_20250818). Anthropic-managed tool
 * type — Claude knows the schema; the executor (in core/anthropic-wiring.ts)
 * implements the 6 commands (view/create/str_replace/insert/delete/rename)
 * over the agent_memory table.
 *
 * Cast to Anthropic.Tool for inclusion in the tools array — the SDK accepts
 * both custom tools and Anthropic-defined tool types in the same parameter.
 */
export const MEMORY_TOOL_DEFINITION: Anthropic.Tool = {
  type: 'memory_20250818',
  name: 'memory',
} as unknown as Anthropic.Tool

/**
 * Anthropic-hosted server-side tools. Selected by `enabledServerTools` in
 * AnthropicAdapterOptions. Anthropic runs the search / fetch / code execution
 * itself — results come back in the assistant message as `server_tool_use` /
 * `server_tool_result` blocks. The adapter doesn't need an executor for them.
 *
 * Pricing notes (charged separately from Messages):
 * - web_search: per-search fee
 * - web_fetch: free
 * - code_execution: per-container-hour after free tier
 *
 * Type-cast to Anthropic.Tool — these are Anthropic-defined tool shapes the
 * SDK accepts in the same `tools` array as custom tools.
 */
export type ServerToolName = 'web_search' | 'web_fetch' | 'code_execution'

export const SERVER_TOOL_DEFINITIONS: Record<ServerToolName, Anthropic.Tool> = {
  web_search: {
    type: 'web_search_20260209',
    name: 'web_search',
  } as unknown as Anthropic.Tool,
  web_fetch: {
    type: 'web_fetch_20260209',
    name: 'web_fetch',
  } as unknown as Anthropic.Tool,
  code_execution: {
    type: 'code_execution_20260120',
    name: 'code_execution',
  } as unknown as Anthropic.Tool,
}

export function buildServerTools(enabled?: ServerToolName[]): Anthropic.Tool[] {
  if (!enabled || enabled.length === 0) return []
  return enabled.map((name) => SERVER_TOOL_DEFINITIONS[name]).filter(Boolean)
}
