import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RuntimeCapability, requireCapability } from '@taia/runtime'
import { createAiderAdapter } from '@taia/runtime/adapters/aider'
import { createClaudeCodeAdapter } from '@taia/runtime/adapters/claude-code'
import { createCursorAdapter } from '@taia/runtime/adapters/cursor'

const adaptersToDisconnect: Array<{ disconnect?: () => void }> = []

function track<T extends { disconnect?: () => void }>(adapter: T): T {
  adaptersToDisconnect.push(adapter)
  return adapter
}

afterEach(() => {
  while (adaptersToDisconnect.length > 0) {
    adaptersToDisconnect.pop()?.disconnect?.()
  }
})

function fakeCliScript(): string {
  const dir = mkdtempSync(join(tmpdir(), 'taia-cli-lifecycle-'))
  const script = join(dir, 'fake-cli.mjs')
  writeFileSync(
    script,
    `
if (process.argv.includes('--version')) {
  console.log('fake-cli 1.0.0')
  process.exit(0)
}
if (process.argv.includes('--hang')) {
  process.on('SIGTERM', () => process.exit(143))
  setInterval(() => {}, 1000)
} else if (process.argv.includes('--stdin')) {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => { input += chunk })
  process.stdin.on('end', () => {
    console.log(JSON.stringify({ mode: 'stdin', input }))
  })
} else {
  const messageIndex = process.argv.findIndex((arg) => arg === '--message' || arg === '--print')
  const input = messageIndex >= 0 ? process.argv[messageIndex + 1] : process.argv.at(-1)
  console.log(JSON.stringify({ mode: 'arg', input }))
}
`,
  )
  return script
}

describe('CLI adapter lifecycle hardening', () => {
  it('delivers Claude Code prompts through argv and records transcript output', async () => {
    const script = fakeCliScript()
    const adapter = track(
      createClaudeCodeAdapter({
        command: process.execPath,
        availabilityArgs: [script, '--version'],
        defaultArgs: [script, '--print'],
        promptMode: 'arg',
      }),
    )

    await expect(adapter.isAvailable()).resolves.toBe(true)
    const result = await adapter.spawnSession('claude task', {
      label: 'argv smoke',
      agentId: 'dev-1',
    })
    await adapter.awaitSessionComplete({ runId: result.runId }, { timeoutMs: 1000 })

    const history = await adapter.getSessionHistory(result.sessionKey)
    expect(history.some((message) => String(message.content).includes('claude task'))).toBe(true)
    await expect(adapter.listSessions({ limit: 1 })).resolves.toMatchObject([
      { key: result.sessionKey, label: 'argv smoke', agentId: 'dev-1' },
    ])
  })

  it('delivers Aider prompts through argv with provider-specific session keys', async () => {
    const script = fakeCliScript()
    const adapter = track(
      createAiderAdapter({
        command: process.execPath,
        availabilityArgs: [script, '--version'],
        defaultArgs: [script, '--message'],
        promptMode: 'arg',
      }),
    )

    const result = await adapter.spawnSession('aider task')
    await adapter.awaitSessionComplete({ sessionKey: result.sessionKey }, { timeoutMs: 1000 })

    expect(result.sessionKey).toMatch(/^agent:aider:/)
    const history = await adapter.getSessionHistory(result.sessionKey)
    expect(history.some((message) => String(message.content).includes('aider task'))).toBe(true)
  })

  it('closes stdin after prompt delivery so stdin-mode CLIs receive EOF', async () => {
    const script = fakeCliScript()
    const adapter = track(
      createClaudeCodeAdapter({
        command: process.execPath,
        availabilityArgs: [script, '--version'],
        defaultArgs: [script, '--stdin'],
        promptMode: 'stdin',
      }),
    )

    const result = await adapter.spawnSession('stdin task')
    await adapter.awaitSessionComplete({ runId: result.runId }, { timeoutMs: 1000 })

    const history = await adapter.getSessionHistory(result.sessionKey, { includeTools: true })
    expect(
      history.some((message) => message.role === 'user' && message.content === 'stdin task'),
    ).toBe(true)
    expect(history.some((message) => String(message.content).includes('stdin closed'))).toBe(true)
    expect(history.some((message) => String(message.content).includes('stdin task'))).toBe(true)
  })

  it('kills timed-out CLI subprocesses and leaves actionable transcript evidence', async () => {
    const script = fakeCliScript()
    const adapter = track(
      createAiderAdapter({
        command: process.execPath,
        availabilityArgs: [script, '--version'],
        defaultArgs: [script, '--hang'],
      }),
    )

    const result = await adapter.spawnSession('will time out', { runTimeoutSeconds: 0.05 })
    await adapter.awaitSessionComplete({ runId: result.runId }, { timeoutMs: 1000 })

    const history = await adapter.getSessionHistory(result.sessionKey, { includeTools: true })
    expect(
      history.some((message) => String(message.content).includes('timed out after 50ms')),
    ).toBe(true)
    expect(history.some((message) => String(message.content).includes('killed with SIGTERM'))).toBe(
      true,
    )
  })

  it('fails fast with an actionable capability error for detectable Cursor without sessions', () => {
    const adapter = createCursorAdapter({
      command: process.execPath,
      availabilityArgs: ['--version'],
    })

    expect(adapter.capabilities.has(RuntimeCapability.Health)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.Sessions)).toBe(false)
    expect(() => requireCapability(adapter, RuntimeCapability.Sessions)).toThrow(
      /Runtime "cursor" does not support capability "sessions"/,
    )
  })
})
