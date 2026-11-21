// OpenClawContextRenderer — projects an AgentContextBundle onto the bootstrap
// files of an OpenClaw agent workspace (the ones `agents.files.*` exposes):
//
//  - SOUL.md      persona and hard rules (personality and tone)
//  - IDENTITY.md  name and role, in the `- **Label:** value` form OpenClaw parses
//  - AGENTS.md    how the agent works, the project and how to reach TAIA
//  - USER.md      the user profile
//
// The task layer is not a file: it changes every run, so it travels in the
// kickoff message (see `kickoff`). Pure and deterministic — the same bundle
// always yields the same files and fingerprint, which is what context sync
// compares against.
//
// Reference: docs/adr/005-runtime-owned-context-and-settings.md

import { createHash } from 'node:crypto'
import type { AgentContextBundle } from '@taia/types'

import type { AgentContextProjection, ProjectedFile } from '../../context-sync'
import {
  renderKickoff,
  renderProjectContext,
  renderTaiaApi,
  renderUserProfile,
} from '../../context-markdown'
import type { SpawnTrigger } from '../../types'

export const OPENCLAW_RENDERER_ID = 'openclaw-workspace'
/** Bump when the rendered output changes, so synced agents get rewritten. */
export const OPENCLAW_RENDERER_VERSION = 1

export interface OpenClawContextRendererOptions {
  /** Public URL of TAIA, used for the API section of AGENTS.md. */
  taiaBaseUrl?: string
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function file(path: string, body: string): ProjectedFile {
  const content = body.trimEnd() + '\n'
  return { path, content, sha256: sha256(content) }
}

export class OpenClawContextRenderer {
  constructor(private readonly options: OpenClawContextRendererOptions = {}) {}

  project(bundle: AgentContextBundle): AgentContextProjection {
    const files = [
      file('SOUL.md', this.soul(bundle)),
      file('IDENTITY.md', this.identity(bundle)),
      file('AGENTS.md', this.agents(bundle)),
      file('USER.md', this.user(bundle)),
    ]
    const fingerprint = sha256(
      [`${OPENCLAW_RENDERER_ID}@${OPENCLAW_RENDERER_VERSION}`]
        .concat(files.map((f) => `${f.path}:${f.sha256}`))
        .join('\n'),
    )
    return {
      rendererId: OPENCLAW_RENDERER_ID,
      rendererVersion: OPENCLAW_RENDERER_VERSION,
      fingerprint,
      files,
    }
  }

  /** First message of a session; see `renderKickoff`. */
  kickoff(bundle: AgentContextBundle, trigger: SpawnTrigger | undefined, prompt: string): string {
    return renderKickoff(bundle, trigger, prompt)
  }

  private soul({ agent }: AgentContextBundle): string {
    const lines = [`# SOUL.md - ${agent.name}`, ``]
    lines.push(agent.persona.trim() || `You are **${agent.name}** — ${agent.role}.`, ``)
    if (agent.constraints && agent.constraints.length > 0) {
      lines.push(`## Boundaries`, ``)
      for (const c of agent.constraints) lines.push(`- ${c}`)
      lines.push(``)
    }
    return lines.join('\n')
  }

  private identity({ agent }: AgentContextBundle): string {
    return [
      `# IDENTITY.md - Who Am I?`,
      ``,
      `- **Name:** ${agent.name}`,
      `- **Theme:** ${agent.role}`,
    ].join('\n')
  }

  private agents(bundle: AgentContextBundle): string {
    const { agent } = bundle
    const lines = [
      `# AGENTS.md - ${agent.name}`,
      ``,
      `Personality and tone live in \`SOUL.md\`. This file is managed by TAIA; ` +
        `edits made here are overwritten on the next sync.`,
      ``,
      `## How you work`,
      ``,
      agent.instructions.trim() ||
        `Work your assigned tasks according to your role: ${agent.role}.`,
      ``,
      demote(renderProjectContext(bundle.project)),
      ``,
    ]
    if (this.options.taiaBaseUrl) {
      lines.push(demote(renderTaiaApi(agent.id, this.options.taiaBaseUrl)), ``)
    }
    return lines.join('\n')
  }

  private user({ user }: AgentContextBundle): string {
    return renderUserProfile(user).replace(/^# User: /, '# USER.md - ')
  }
}

/** Shift every markdown heading one level down so a section nests under `#`. */
function demote(md: string): string {
  return md.replace(/^(#+) /gm, '#$1 ')
}
