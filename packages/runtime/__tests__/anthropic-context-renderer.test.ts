// AnthropicContextRenderer — verifies the bundle → request shape mapping.
//
// What we test:
//  - Three stable layers (agent, project, user) each become a cached system
//    block with cache_control: ephemeral.
//  - The task layer becomes a separate user message, NOT a system block, so
//    cache hits stay high turn-to-turn (the prefix doesn't move).
//  - Capabilities resolve to the expected Anthropic tool names.
//  - Optional layer fields (constraints, glossary, knowledge refs, doNotDo,
//    deadline, dependencies, expectedOutput, workingState) appear when
//    provided and are absent when not — no empty headers.
//  - Unknown capabilities throw loud (per ADR-003).

import { describe, it, expect } from 'vitest'
import type { AgentContextBundle } from '@taia/types'

import {
  AnthropicContextRenderer,
  type RenderedAnthropicContext,
} from '../src/adapters/anthropic/context-renderer'

function minimalBundle(overrides: Partial<AgentContextBundle> = {}): AgentContextBundle {
  return {
    agent: {
      id: 'alex',
      name: 'Alex',
      role: 'Reviewer',
      persona: 'You review pull requests carefully.',
      instructions: 'Always read the test plan before approving.',
      capabilities: ['read_tasks', 'comment_tasks'],
    },
    project: {
      name: 'TAIA',
      description: 'Kanban for AI agents.',
    },
    user: {
      id: 'user-1',
      displayName: 'Sam',
    },
    task: {
      title: 'Review PR #42',
      description: 'Sign off on the runtime refactor.',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
    },
    memory: { recall: [], archival: [], working: {} },
    ...overrides,
  }
}

describe('AnthropicContextRenderer', () => {
  const renderer = new AnthropicContextRenderer()

  it('produces three cached system blocks (agent, project, user)', () => {
    const out = renderer.render(minimalBundle())
    expect(out.systemBlocks).toHaveLength(3)
    for (const block of out.systemBlocks) {
      expect(block.type).toBe('text')
      expect(block.cache_control).toEqual({ type: 'ephemeral' })
    }
    // Order matters for prefix caching — agent first, then project, then user.
    expect(out.systemBlocks[0].text).toMatch(/^# Identity/)
    expect(out.systemBlocks[1].text).toMatch(/^# Project: TAIA/)
    expect(out.systemBlocks[2].text).toMatch(/^# User: Sam/)
  })

  it('renders the task layer as the user kickoff message, NOT in system', () => {
    const out: RenderedAnthropicContext = renderer.render(minimalBundle())
    expect(out.taskMessage).toMatch(/^# Task: Review PR #42/)
    expect(out.taskMessage).toContain('IN_PROGRESS')
    expect(out.taskMessage).toContain('Sign off on the runtime refactor.')
    // Sanity: task content must not have leaked into any system block.
    for (const block of out.systemBlocks) {
      expect(block.text).not.toContain('Review PR #42')
    }
  })

  it('tells the agent which worktree to work in when the task has one', () => {
    const bundle = minimalBundle()
    bundle.task.workspace = { path: '/tmp/wt/pr-42', branch: 'taia/pr-42', baseBranch: 'main' }
    const out = renderer.render(bundle)
    expect(out.taskMessage).toContain('## Workspace')
    expect(out.taskMessage).toContain('`/tmp/wt/pr-42` on branch `taia/pr-42` (based on `main`)')
    expect(renderer.render(minimalBundle()).taskMessage).not.toContain('## Workspace')
  })

  it('resolves agent capabilities to deduplicated tool names', () => {
    const out = renderer.render(
      minimalBundle({
        agent: {
          id: 'alex',
          name: 'Alex',
          role: 'Reviewer',
          persona: '',
          instructions: '',
          // Overlapping sets to verify dedup (none currently overlap, but the
          // renderer must still preserve unique names).
          capabilities: ['read_tasks', 'write_tasks', 'comment_tasks'],
        },
      }),
    )
    expect(out.toolNames.sort()).toEqual([
      'taia_tasks_comment',
      'taia_tasks_create',
      'taia_tasks_get',
      'taia_tasks_list',
      'taia_tasks_update',
    ])
  })

  it('throws for an unknown capability (fail-loud per ADR-003)', () => {
    expect(() =>
      renderer.render(
        minimalBundle({
          agent: {
            id: 'alex',
            name: 'Alex',
            role: 'Reviewer',
            persona: '',
            instructions: '',
            capabilities: ['nonexistent' as never],
          },
        }),
      ),
    ).toThrow(/does not support capability 'nonexistent'/)
  })

  it('omits optional sections when fields are absent', () => {
    const out = renderer.render(minimalBundle())
    const all = out.systemBlocks.map((b) => b.text).join('\n\n')
    expect(all).not.toContain('## Constraints')
    expect(all).not.toContain('## Glossary')
    expect(all).not.toContain('## Knowledge')
    expect(all).not.toContain('## Facts')
    expect(all).not.toContain('## Preferences')
    expect(all).not.toContain('## Do NOT')
    expect(out.taskMessage).not.toContain('## Expected output')
    expect(out.taskMessage).not.toContain('## Current working state')
    expect(out.taskMessage).not.toContain('Deadline')
    expect(out.taskMessage).not.toContain('Depends on')
  })

  it('renders all optional sections when provided', () => {
    const out = renderer.render(
      minimalBundle({
        agent: {
          id: 'alex',
          name: 'Alex',
          role: 'Reviewer',
          persona: 'careful reviewer',
          instructions: 'always test',
          capabilities: ['read_tasks'],
          constraints: ['never approve without tests', 'always read the diff'],
        },
        project: {
          name: 'TAIA',
          description: 'Kanban for AI agents.',
          glossary: { worktree: 'a git worktree per task' },
          knowledgeRefs: [
            {
              kind: 'doc',
              uri: 'docs/AGENT_CONTEXT_MODEL.md',
              description: 'context model',
              cacheable: true,
            },
          ],
        },
        user: {
          id: 'user-1',
          displayName: 'Sam',
          facts: ['likes short answers'],
          preferences: { language: 'es' },
          doNotDo: ['guess when uncertain'],
        },
        task: {
          taskId: 't-1',
          title: 'Review PR #42',
          description: 'Sign off.',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          expectedOutput: 'Approved or change requests',
          workingState: 'Read 3 of 5 files.',
          deadline: '2026-05-10',
          dependencies: ['t-0'],
        },
      }),
    )
    const all = out.systemBlocks.map((b) => b.text).join('\n\n')
    expect(all).toContain('## Constraints')
    expect(all).toContain('never approve without tests')
    expect(all).toContain('## Glossary')
    expect(all).toContain('worktree')
    expect(all).toContain('## Knowledge')
    expect(all).toContain('AGENT_CONTEXT_MODEL.md')
    expect(all).toContain('## Facts')
    expect(all).toContain('likes short answers')
    expect(all).toContain('## Preferences')
    expect(all).toContain('language')
    expect(all).toContain('## Do NOT')
    expect(all).toContain('guess when uncertain')

    expect(out.taskMessage).toContain('Deadline: 2026-05-10')
    expect(out.taskMessage).toContain('Depends on: t-0')
    expect(out.taskMessage).toContain('Task ID: t-1')
    expect(out.taskMessage).toContain('## Expected output')
    expect(out.taskMessage).toContain('Approved or change requests')
    expect(out.taskMessage).toContain('## Current working state')
    expect(out.taskMessage).toContain('Read 3 of 5 files.')
  })
})
