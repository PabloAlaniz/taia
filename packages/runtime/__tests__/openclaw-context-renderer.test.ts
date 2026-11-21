import { describe, it, expect } from 'vitest'

import { OpenClawContextRenderer } from '../src/adapters/openclaw/context-renderer'
import { sampleBundle } from './fixtures/context-bundle'

const renderer = new OpenClawContextRenderer({ taiaBaseUrl: 'http://taia.test' })

function files(bundle = sampleBundle()) {
  return Object.fromEntries(renderer.project(bundle).files.map((f) => [f.path, f.content]))
}

describe('OpenClawContextRenderer', () => {
  it('projects the bootstrap files OpenClaw reads', () => {
    expect(Object.keys(files())).toEqual(['SOUL.md', 'IDENTITY.md', 'AGENTS.md', 'USER.md'])
  })

  it('renders the workspace files', () => {
    expect(files()).toMatchSnapshot()
  })

  it('puts persona and hard rules in SOUL.md', () => {
    const soul = files()['SOUL.md']
    expect(soul).toContain('You review pull requests carefully.')
    expect(soul).toContain('## Boundaries\n\n- Never merge your own PR.')
  })

  it('writes IDENTITY.md in the label form OpenClaw parses', () => {
    expect(files()['IDENTITY.md']).toContain('- **Name:** Alex\n- **Theme:** Reviewer')
  })

  it('falls back to the role when the persona is empty', () => {
    const bundle = sampleBundle()
    const soul = files({ ...bundle, agent: { ...bundle.agent, persona: '' } })['SOUL.md']
    expect(soul).toContain('You are **Alex** — Reviewer.')
  })

  it('leaves the TAIA API out of AGENTS.md without a base URL', () => {
    const plain = new OpenClawContextRenderer().project(sampleBundle())
    expect(plain.files.find((f) => f.path === 'AGENTS.md')?.content).not.toContain('TAIA board')
  })

  it('keeps the task layer out of the files', () => {
    expect(Object.values(files()).join('\n')).not.toContain('Review PR #42')
  })

  it('hashes each file and fingerprints the set deterministically', () => {
    const a = renderer.project(sampleBundle())
    const b = renderer.project(sampleBundle())
    expect(a.fingerprint).toBe(b.fingerprint)
    for (const f of a.files) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/)

    const bundle = sampleBundle()
    const changed = renderer.project({ ...bundle, agent: { ...bundle.agent, persona: 'Other.' } })
    expect(changed.fingerprint).not.toBe(a.fingerprint)
  })

  it('ignores the task layer in the fingerprint', () => {
    const bundle = sampleBundle()
    const other = renderer.project({ ...bundle, task: { ...bundle.task, title: 'Something else' } })
    expect(other.fingerprint).toBe(renderer.project(bundle).fingerprint)
  })
})
