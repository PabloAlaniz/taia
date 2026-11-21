// Generic CLI protocol — shared process/session layer for adapters backed by
// local command-line runtimes (Claude Code, Cursor, Aider, etc.).
//
// The class intentionally exposes a small protocol surface (`spawn`, `status`,
// `send`, `kill`, `getTranscript`, `isAvailable`) instead of TAIA's full
// AgentRuntimeAdapter contract. Runtime-specific adapters can compose this
// layer and map the generic CLI session model to canonical RuntimeSession /
// RuntimeMessage shapes without duplicating process bookkeeping.

import { spawn as spawnChild, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export type GenericCliSessionStatus = 'running' | 'exited' | 'failed' | 'killed'

export interface GenericCliTranscriptEntry {
  stream: 'stdin' | 'stdout' | 'stderr' | 'system'
  content: string
  timestamp: string
}

export interface GenericCliSession {
  id: string
  pid?: number
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  status: GenericCliSessionStatus
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  startedAt: number
  updatedAt: number
}

export interface GenericCliSpawnOptions {
  id?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  input?: string
  closeStdinAfterInput?: boolean
  runTimeoutMs?: number
}

export interface GenericCliProtocolOptions {
  command: string
  defaultArgs?: string[]
  defaultCwd?: string
  defaultEnv?: Record<string, string>
  availabilityArgs?: string[]
  availabilityTimeoutMs?: number
  sessionIdPrefix?: string
}

interface SessionRecord {
  session: GenericCliSession
  process: ChildProcessWithoutNullStreams
  transcript: GenericCliTranscriptEntry[]
  timeout?: NodeJS.Timeout
}

function nowIso(): string {
  return new Date().toISOString()
}

function mergeEnv(env?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...env,
  }
}

function appendTranscript(
  record: SessionRecord,
  stream: GenericCliTranscriptEntry['stream'],
  content: string,
): void {
  record.transcript.push({ stream, content, timestamp: nowIso() })
  record.session.updatedAt = Date.now()
}

export class GenericCliProtocol {
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly command: string
  private readonly defaultArgs: string[]
  private readonly defaultCwd?: string
  private readonly defaultEnv?: Record<string, string>
  private readonly availabilityArgs: string[]
  private readonly availabilityTimeoutMs: number
  private readonly sessionIdPrefix: string

  constructor(options: GenericCliProtocolOptions) {
    this.command = options.command
    this.defaultArgs = options.defaultArgs ?? []
    this.defaultCwd = options.defaultCwd
    this.defaultEnv = options.defaultEnv
    this.availabilityArgs = options.availabilityArgs ?? ['--version']
    this.availabilityTimeoutMs = options.availabilityTimeoutMs ?? 2_000
    this.sessionIdPrefix = options.sessionIdPrefix ?? 'cli'
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawnChild(this.command, this.availabilityArgs, {
        cwd: this.defaultCwd,
        env: mergeEnv(this.defaultEnv),
        stdio: 'ignore',
      })

      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        resolve(false)
      }, this.availabilityTimeoutMs)

      child.once('error', () => {
        clearTimeout(timer)
        resolve(false)
      })

      child.once('exit', (code) => {
        clearTimeout(timer)
        resolve(code === 0)
      })
    })
  }

  spawn(input: string, options: GenericCliSpawnOptions = {}): GenericCliSession {
    const id = options.id ?? `${this.sessionIdPrefix}-${randomUUID()}`
    if (this.sessions.has(id)) {
      throw new Error(`CLI session already exists: ${id}`)
    }

    const args = [...this.defaultArgs, ...(options.args ?? [])]
    const cwd = options.cwd ?? this.defaultCwd
    const env = { ...this.defaultEnv, ...options.env }
    const child = spawnChild(this.command, args, {
      cwd,
      env: mergeEnv(env),
      stdio: 'pipe',
    })

    const startedAt = Date.now()
    const session: GenericCliSession = {
      id,
      pid: child.pid,
      command: this.command,
      args,
      cwd,
      env,
      status: 'running',
      startedAt,
      updatedAt: startedAt,
    }
    const record: SessionRecord = { session, process: child, transcript: [] }
    this.sessions.set(id, record)

    child.stdout.on('data', (chunk: Buffer) => appendTranscript(record, 'stdout', chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => appendTranscript(record, 'stderr', chunk.toString()))
    child.once('error', (err) => {
      session.status = 'failed'
      appendTranscript(record, 'system', err.message)
    })
    child.once('exit', (code, signal) => {
      if (record.timeout) clearTimeout(record.timeout)
      session.exitCode = code
      session.signal = signal
      if (session.status === 'killed') return
      session.status = code === 0 ? 'exited' : 'failed'
      session.updatedAt = Date.now()
    })

    if (typeof options.runTimeoutMs === 'number' && options.runTimeoutMs > 0) {
      record.timeout = setTimeout(() => {
        if (record.session.status !== 'running') return
        appendTranscript(record, 'system', `timed out after ${options.runTimeoutMs}ms`)
        this.kill(id, 'SIGTERM')
      }, options.runTimeoutMs)
    }

    const initialInput = options.input ?? input
    if (initialInput.length > 0) {
      this.send(id, initialInput)
    }
    if (options.closeStdinAfterInput) {
      record.process.stdin.end()
      appendTranscript(record, 'system', 'stdin closed')
    }

    return { ...session }
  }

  status(sessionId: string): GenericCliSession | null {
    const record = this.sessions.get(sessionId)
    return record ? { ...record.session, args: [...record.session.args] } : null
  }

  send(sessionId: string, input: string): void {
    const record = this.requireSession(sessionId)
    if (record.session.status !== 'running') {
      throw new Error(`Cannot send input to non-running CLI session: ${sessionId}`)
    }

    record.process.stdin.write(input)
    appendTranscript(record, 'stdin', input)
  }

  kill(sessionId: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const record = this.requireSession(sessionId)
    if (record.session.status !== 'running') return false

    const killed = record.process.kill(signal)
    if (killed) {
      record.session.status = 'killed'
      record.session.signal = signal
      appendTranscript(record, 'system', `killed with ${signal}`)
    }
    return killed
  }

  getTranscript(sessionId: string): GenericCliTranscriptEntry[] {
    return this.requireSession(sessionId).transcript.map((entry) => ({ ...entry }))
  }

  listSessions(): GenericCliSession[] {
    return Array.from(this.sessions.values()).map((record) => ({
      ...record.session,
      args: [...record.session.args],
    }))
  }

  private requireSession(sessionId: string): SessionRecord {
    const record = this.sessions.get(sessionId)
    if (!record) throw new Error(`Unknown CLI session: ${sessionId}`)
    return record
  }
}
