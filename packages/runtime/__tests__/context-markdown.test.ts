import { describe, it, expect } from 'vitest'

import { renderKickoff, renderTaiaApi } from '../src/context-markdown'
import { renderCliPrompt } from '../src/adapters/cli/context-prompt'
import { sampleBundle } from './fixtures/context-bundle'

describe('renderKickoff', () => {
  it('briefs the task when no trigger is given', () => {
    const out = renderKickoff(sampleBundle(), undefined, 'ignored')
    expect(out).toMatch(/^# Task: Review PR #42/)
    expect(out).toContain('Work in the git worktree at `/w/task-7` on branch `task-7`')
  })

  it('asks a heartbeat to check its work and includes the current task', () => {
    const out = renderKickoff(sampleBundle(), { kind: 'heartbeat' }, 'ignored')
    expect(out).toMatch(/^# Heartbeat/)
    expect(out).toContain('HEARTBEAT_OK')
    expect(out).toContain('# Task: Review PR #42')
  })

  it('omits the briefing on a heartbeat with no assigned task', () => {
    const bundle = sampleBundle()
    const out = renderKickoff(
      { ...bundle, task: { ...bundle.task, taskId: undefined } },
      { kind: 'heartbeat' },
      '',
    )
    expect(out).not.toContain('# Task:')
  })

  it('passes a free-form prompt through unchanged', () => {
    expect(renderKickoff(sampleBundle(), { kind: 'prompt' }, 'Summarise the board.')).toBe(
      'Summarise the board.',
    )
  })
})

describe('renderTaiaApi', () => {
  it('lists the agent endpoints under the base URL, without a trailing slash', () => {
    const out = renderTaiaApi('alex', 'http://taia.test/')
    expect(out).toContain('`GET http://taia.test/api/tasks?assigned_to=alex`')
    expect(out).toContain('http://taia.test/api/agents/alex/working-state')
  })
})

describe('renderCliPrompt', () => {
  it('returns the task as-is without a bundle', () => {
    expect(renderCliPrompt('do it')).toBe('do it')
  })

  it('renders identity, project, user, API and kickoff into one prompt', () => {
    const out = renderCliPrompt(
      'fallback',
      { context: sampleBundle(), trigger: { kind: 'heartbeat' } },
      'http://taia.test',
    )
    const order = [
      '# Identity',
      '# Project: TAIA',
      '# User: Sam',
      '# TAIA board',
      '# Heartbeat',
    ].map((h) => out.indexOf(h))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(out).toContain('Never merge your own PR.')
  })
})
