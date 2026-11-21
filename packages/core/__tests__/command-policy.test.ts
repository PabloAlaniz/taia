import { afterEach, describe, expect, it } from 'vitest'
import { cliCommandEnvKey, resolveCliCommand, resolveCliCwd } from '../src/command-policy'

afterEach(() => {
  delete process.env.TAIA_CLI_COMMAND_CLAUDE_CODE
  delete process.env.TAIA_CLI_CWD
})

describe('cliCommandEnvKey', () => {
  it('derives the env var from the provider id', () => {
    expect(cliCommandEnvKey('claude-code')).toBe('TAIA_CLI_COMMAND_CLAUDE_CODE')
    expect(cliCommandEnvKey('aider')).toBe('TAIA_CLI_COMMAND_AIDER')
  })
})

describe('resolveCliCommand', () => {
  it("allows the provider's own binary, bare or as an absolute path", () => {
    expect(resolveCliCommand('claude-code', 'claude')).toEqual({
      command: 'claude',
      rejected: false,
    })
    expect(resolveCliCommand('aider', '/opt/homebrew/bin/aider')).toEqual({
      command: '/opt/homebrew/bin/aider',
      rejected: false,
    })
  })

  it('allows every binary a provider declares', () => {
    expect(resolveCliCommand('cursor', 'cursor-agent').rejected).toBe(false)
  })

  it('refuses any other program', () => {
    for (const cmd of [
      'node',
      'sh',
      'bash -c id',
      './claude',
      'claude; rm -rf /',
      '/tmp/x/aider',
      'claude-code',
    ]) {
      expect(resolveCliCommand('claude-code', cmd)).toEqual({ command: null, rejected: true })
    }
  })

  it('refuses commands for providers without a CLI binary', () => {
    expect(resolveCliCommand('openclaw', 'claude')).toEqual({ command: null, rejected: true })
  })

  it('treats an empty command as unset, not refused', () => {
    expect(resolveCliCommand('claude-code', '  ')).toEqual({ command: null, rejected: false })
    expect(resolveCliCommand('claude-code', null)).toEqual({ command: null, rejected: false })
  })

  it('lets the operator pick any binary through the env var, which wins over settings', () => {
    process.env.TAIA_CLI_COMMAND_CLAUDE_CODE = '/srv/bin/claude-wrapper'
    expect(resolveCliCommand('claude-code', 'node')).toEqual({
      command: '/srv/bin/claude-wrapper',
      rejected: false,
    })
  })
})

describe('resolveCliCwd', () => {
  it('uses TAIA_CLI_CWD over the stored value', () => {
    expect(resolveCliCwd('/work')).toBe('/work')
    process.env.TAIA_CLI_CWD = '/srv/agents'
    expect(resolveCliCwd('/work')).toBe('/srv/agents')
  })
})
