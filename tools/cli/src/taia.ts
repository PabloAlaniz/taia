#!/usr/bin/env npx ts-node

/**
 * TAIA CLI
 *
 * Usage:
 *   taia status              - Show active tasks
 *   taia list [status]       - List tasks (optional: filter by status)
 *   taia begin <task_id>     - Start working on a task
 *   taia done <task_id>      - Complete a task
 *   taia pause <task_id>     - Pause a task (back to ASSIGNED)
 *   taia block <task_id>     - Mark task as blocked
 *   taia assign <task_id> <agent_id> - Assign task to agent
 *   taia create <title>      - Create new task
 *   taia show <task_id>      - Show task details
 */

const API_BASE = process.env.TAIA_API || 'http://localhost:13333'
// The access token of a protected instance (TAIA_API_TOKEN on the server).
const API_TOKEN = (process.env.TAIA_TOKEN || process.env.TAIA_API_TOKEN || '').trim()

/**
 * The part of a task id that tells tasks apart. Generated ids are
 * `<timestamp>-<random>`, so their first characters are shared by every task
 * created around the same time; the random suffix is the useful part.
 */
function shortId(id: string): string {
  return /^\d{10,}-([a-z0-9]+)$/.exec(id)?.[1] ?? id.slice(0, 8)
}

/**
 * Find a task by its full id, its short id or a prefix of the full id.
 * Refuses an input that matches more than one task instead of picking one.
 */
function findTask<T extends { id: string; title: string }>(
  tasks: T[],
  input: string,
): T | undefined {
  const exact = tasks.find((t) => t.id === input)
  if (exact) return exact
  const matches = tasks.filter((t) => shortId(t.id) === input || t.id.startsWith(input))
  if (matches.length > 1) {
    console.error(`Error: "${input}" matches ${matches.length} tasks. Use one of:`)
    for (const t of matches.slice(0, 10)) console.error(`  ${shortId(t.id)}  ${t.title}`)
    process.exit(1)
  }
  return matches[0]
}

interface Task {
  id: string
  title: string
  status: string
  priority: string
  assigned_to?: string
  project?: string
  tags?: string[]
  started_at?: string
  completed_at?: string
  time_spent_minutes?: number
}

interface Agent {
  id: string
  name: string
  avatar: string
}

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

const STATUS_COLORS: Record<string, string> = {
  IDEA: COLORS.cyan,
  INBOX: COLORS.dim,
  ASSIGNED: COLORS.blue,
  IN_PROGRESS: COLORS.yellow,
  REVIEW: COLORS.magenta,
  DONE: COLORS.green,
  REJECTED: COLORS.red,
}

const PRIORITY_ICONS: Record<string, string> = {
  LOW: '○',
  MEDIUM: '◐',
  HIGH: '●',
  URGENT: '🔴',
}

async function api(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      ...options?.headers,
    },
  })
  if (res.status === 401) {
    console.error(
      'Error: this TAIA instance needs an access token. Set TAIA_TOKEN to the value of its TAIA_API_TOKEN.',
    )
    process.exit(1)
  }
  // Not every route wraps its body in `{ ok }`: success is the HTTP status
  // unless the body says otherwise.
  const body = await res.json().catch(() => ({}))
  return {
    ...body,
    ok: res.ok && body.ok !== false,
    error: body.error ?? (res.ok ? undefined : `HTTP ${res.status}`),
  }
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

function printTask(task: Task, agents: Agent[], verbose = false) {
  const color = STATUS_COLORS[task.status] || COLORS.reset
  const priority = PRIORITY_ICONS[task.priority] || '?'
  const agent = agents.find((a) => a.id === task.assigned_to)
  const agentStr = agent ? `${agent.avatar} ${agent.name}` : ''

  console.log(`${color}${priority} [${shortId(task.id)}]${COLORS.reset} ${task.title}`)

  if (verbose) {
    console.log(`   Status: ${color}${task.status}${COLORS.reset}`)
    if (agentStr) console.log(`   Assigned: ${agentStr}`)
    if (task.project) console.log(`   Project: ${task.project}`)
    if (task.time_spent_minutes) {
      console.log(`   Time: ${formatTime(task.time_spent_minutes)}`)
    }
    console.log()
  } else {
    const parts = [task.status]
    if (agentStr) parts.push(agentStr)
    if (task.time_spent_minutes) parts.push(formatTime(task.time_spent_minutes))
    console.log(`   ${COLORS.dim}${parts.join(' · ')}${COLORS.reset}`)
  }
}

async function cmdStatus() {
  const [tasksRes, agentsRes] = await Promise.all([api('/api/tasks'), api('/api/agents')])

  const tasks: Task[] = tasksRes.tasks || []
  const agents: Agent[] = agentsRes.agents || []

  const active = tasks.filter((t) => t.status === 'IN_PROGRESS')
  const assigned = tasks.filter((t) => t.status === 'ASSIGNED')
  const blocked = tasks.filter(
    (t) => t.tags?.includes('blocked') || t.tags?.includes('needs-clarification'),
  )
  const review = tasks.filter((t) => t.status === 'REVIEW')

  console.log(`\n${COLORS.bold}🧉 TAIA Status${COLORS.reset}\n`)

  if (active.length > 0) {
    console.log(`${COLORS.yellow}▶ In Progress (${active.length})${COLORS.reset}`)
    active.forEach((t) => printTask(t, agents))
    console.log()
  }

  if (review.length > 0) {
    console.log(`${COLORS.magenta}👀 Review (${review.length})${COLORS.reset}`)
    review.forEach((t) => printTask(t, agents))
    console.log()
  }

  if (blocked.length > 0) {
    console.log(`${COLORS.red}🚫 Blocked/Clarify (${blocked.length})${COLORS.reset}`)
    blocked.forEach((t) => printTask(t, agents))
    console.log()
  }

  if (assigned.length > 0) {
    console.log(`${COLORS.blue}📋 Assigned (${assigned.length})${COLORS.reset}`)
    assigned.forEach((t) => printTask(t, agents))
    console.log()
  }

  const inbox = tasks.filter((t) => t.status === 'INBOX').length
  const done = tasks.filter((t) => t.status === 'DONE').length
  console.log(`${COLORS.dim}📥 Inbox: ${inbox} | ✅ Done: ${done}${COLORS.reset}\n`)
}

async function cmdList(statusFilter?: string) {
  const [tasksRes, agentsRes] = await Promise.all([api('/api/tasks'), api('/api/agents')])

  let tasks: Task[] = tasksRes.tasks || []
  const agents: Agent[] = agentsRes.agents || []

  if (statusFilter) {
    const filter = statusFilter.toUpperCase()
    tasks = tasks.filter((t) => t.status === filter)
  }

  console.log(`\n${COLORS.bold}📋 Tasks (${tasks.length})${COLORS.reset}\n`)
  tasks.forEach((t) => printTask(t, agents))
  console.log()
}

async function cmdBegin(taskId: string) {
  // Find task by partial ID
  const tasksRes = await api('/api/tasks')
  const tasks: Task[] = tasksRes.tasks || []
  const task = findTask(tasks, taskId)

  if (!task) {
    console.error(`${COLORS.red}Error: Task not found: ${taskId}${COLORS.reset}`)
    process.exit(1)
  }

  // Update status and set started_at
  const res = await api(`/api/tasks/${task.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      status: 'IN_PROGRESS',
      started_at: new Date().toISOString(),
    }),
  })

  if (res.ok) {
    console.log(`${COLORS.green}▶ Started: ${task.title}${COLORS.reset}`)
    console.log(`${COLORS.dim}  ID: ${task.id}${COLORS.reset}`)
  } else {
    console.error(`${COLORS.red}Error: ${res.error}${COLORS.reset}`)
  }
}

async function cmdDone(taskId: string) {
  const tasksRes = await api('/api/tasks')
  const tasks: Task[] = tasksRes.tasks || []
  const task = findTask(tasks, taskId)

  if (!task) {
    console.error(`${COLORS.red}Error: Task not found: ${taskId}${COLORS.reset}`)
    process.exit(1)
  }

  // Calculate time spent
  let timeSpent = task.time_spent_minutes || 0
  if (task.started_at) {
    const started = new Date(task.started_at)
    const now = new Date()
    const minutes = Math.round((now.getTime() - started.getTime()) / 60000)
    timeSpent += minutes
  }

  const res = await api(`/api/tasks/${task.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      status: 'DONE',
      completed_at: new Date().toISOString(),
      time_spent_minutes: timeSpent,
    }),
  })

  if (res.ok) {
    console.log(`${COLORS.green}✅ Completed: ${task.title}${COLORS.reset}`)
    if (timeSpent > 0) {
      console.log(`${COLORS.dim}  Time spent: ${formatTime(timeSpent)}${COLORS.reset}`)
    }
  } else {
    console.error(`${COLORS.red}Error: ${res.error}${COLORS.reset}`)
  }
}

async function cmdPause(taskId: string) {
  const tasksRes = await api('/api/tasks')
  const tasks: Task[] = tasksRes.tasks || []
  const task = findTask(tasks, taskId)

  if (!task) {
    console.error(`${COLORS.red}Error: Task not found: ${taskId}${COLORS.reset}`)
    process.exit(1)
  }

  // Calculate time spent so far
  let timeSpent = task.time_spent_minutes || 0
  if (task.started_at) {
    const started = new Date(task.started_at)
    const now = new Date()
    const minutes = Math.round((now.getTime() - started.getTime()) / 60000)
    timeSpent += minutes
  }

  const res = await api(`/api/tasks/${task.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      status: 'ASSIGNED',
      started_at: null,
      time_spent_minutes: timeSpent,
    }),
  })

  if (res.ok) {
    console.log(`${COLORS.yellow}⏸ Paused: ${task.title}${COLORS.reset}`)
    if (timeSpent > 0) {
      console.log(`${COLORS.dim}  Time tracked: ${formatTime(timeSpent)}${COLORS.reset}`)
    }
  } else {
    console.error(`${COLORS.red}Error: ${res.error}${COLORS.reset}`)
  }
}

async function cmdBlock(taskId: string) {
  const tasksRes = await api('/api/tasks')
  const tasks: Task[] = tasksRes.tasks || []
  const task = findTask(tasks, taskId)

  if (!task) {
    console.error(`${COLORS.red}Error: Task not found: ${taskId}${COLORS.reset}`)
    process.exit(1)
  }

  // Add 'blocked' tag (blocked is now a tag, not a status)
  const currentTags = task.tags || []
  if (currentTags.includes('blocked')) {
    console.log(`${COLORS.dim}Task already has blocked tag${COLORS.reset}`)
    return
  }

  const res = await api(`/api/tasks/${task.id}`, {
    method: 'PUT',
    body: JSON.stringify({ tags: [...currentTags, 'blocked'] }),
  })

  if (res.ok) {
    console.log(`${COLORS.red}🚫 Blocked: ${task.title}${COLORS.reset}`)
  } else {
    console.error(`${COLORS.red}Error: ${res.error}${COLORS.reset}`)
  }
}

async function cmdAssign(taskId: string, agentId: string) {
  const [tasksRes, agentsRes] = await Promise.all([api('/api/tasks'), api('/api/agents')])

  const tasks: Task[] = tasksRes.tasks || []
  const agents: Agent[] = agentsRes.agents || []

  const task = findTask(tasks, taskId)
  if (!task) {
    console.error(`${COLORS.red}Error: Task not found: ${taskId}${COLORS.reset}`)
    process.exit(1)
  }

  const agent = agents.find(
    (a) => a.id === agentId || a.name.toLowerCase() === agentId.toLowerCase(),
  )
  if (!agent) {
    console.error(`${COLORS.red}Error: Agent not found: ${agentId}${COLORS.reset}`)
    console.log(`Available agents: ${agents.map((a) => a.id).join(', ')}`)
    process.exit(1)
  }

  const res = await api('/api/tasks/assign', {
    method: 'POST',
    body: JSON.stringify({ taskId: task.id, agentId: agent.id }),
  })

  if (res.ok) {
    console.log(`${COLORS.green}🎯 Assigned: ${task.title}${COLORS.reset}`)
    console.log(`${COLORS.dim}  → ${agent.avatar} ${agent.name}${COLORS.reset}`)
  } else {
    console.error(`${COLORS.red}Error: ${res.error}${COLORS.reset}`)
  }
}

async function cmdCreate(title: string) {
  const res = await api('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      action: 'create',
      task: {
        title,
        priority: 'MEDIUM',
        created_by: 'cli',
      },
    }),
  })

  if (res.ok && res.task) {
    console.log(`${COLORS.green}📝 Created: ${title}${COLORS.reset}`)
    console.log(`${COLORS.dim}  ID: ${res.task.id}${COLORS.reset}`)
  } else {
    console.error(`${COLORS.red}Error: ${res.error}${COLORS.reset}`)
  }
}

async function cmdShow(taskId: string) {
  const [tasksRes, agentsRes] = await Promise.all([api('/api/tasks'), api('/api/agents')])

  const tasks: Task[] = tasksRes.tasks || []
  const agents: Agent[] = agentsRes.agents || []

  const task = findTask(tasks, taskId)
  if (!task) {
    console.error(`${COLORS.red}Error: Task not found: ${taskId}${COLORS.reset}`)
    process.exit(1)
  }

  console.log()
  printTask(task, agents, true)
}

function printHelp() {
  console.log(`
${COLORS.bold}🧉 TAIA CLI${COLORS.reset}

${COLORS.cyan}Usage:${COLORS.reset}
  taia status              Show active tasks
  taia list [status]       List tasks (filter: inbox, assigned, in_progress, etc)
  taia begin <id>          Start working on a task
  taia done <id>           Complete a task
  taia pause <id>          Pause task (saves time)
  taia block <id>          Mark as blocked
  taia assign <id> <agent> Assign task to agent
  taia create <title>      Create new task
  taia show <id>           Show task details

${COLORS.cyan}Examples:${COLORS.reset}
  taia begin abc123        Start task abc123
  taia done abc            Complete task (partial ID match)
  taia assign abc agent-1  Assign to agent
  taia list in_progress    Show in-progress tasks
  taia create "Fix bug"    Create new task

${COLORS.dim}API: ${API_BASE}${COLORS.reset}
`)
}

// Main
async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  try {
    switch (cmd) {
      case 'status':
      case 's':
        await cmdStatus()
        break
      case 'list':
      case 'ls':
        await cmdList(args[1])
        break
      case 'begin':
      case 'start':
      case 'b':
        if (!args[1]) {
          console.error('Usage: taia begin <task_id>')
          process.exit(1)
        }
        await cmdBegin(args[1])
        break
      case 'done':
      case 'd':
        if (!args[1]) {
          console.error('Usage: taia done <task_id>')
          process.exit(1)
        }
        await cmdDone(args[1])
        break
      case 'pause':
      case 'p':
        if (!args[1]) {
          console.error('Usage: taia pause <task_id>')
          process.exit(1)
        }
        await cmdPause(args[1])
        break
      case 'block':
        if (!args[1]) {
          console.error('Usage: taia block <task_id>')
          process.exit(1)
        }
        await cmdBlock(args[1])
        break
      case 'assign':
      case 'a':
        if (!args[1] || !args[2]) {
          console.error('Usage: taia assign <task_id> <agent_id>')
          process.exit(1)
        }
        await cmdAssign(args[1], args[2])
        break
      case 'create':
      case 'c':
        if (!args[1]) {
          console.error('Usage: taia create <title>')
          process.exit(1)
        }
        await cmdCreate(args.slice(1).join(' '))
        break
      case 'show':
        if (!args[1]) {
          console.error('Usage: taia show <task_id>')
          process.exit(1)
        }
        await cmdShow(args[1])
        break
      case 'help':
      case '-h':
      case '--help':
      default:
        printHelp()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${COLORS.red}Error: ${message}${COLORS.reset}`)
    console.error(`${COLORS.dim}Is TAIA running at ${API_BASE}?${COLORS.reset}`)
    process.exit(1)
  }
}

main()
