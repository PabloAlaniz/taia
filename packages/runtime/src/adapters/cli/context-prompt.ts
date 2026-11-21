// Context prompt for CLI agents (Claude Code, Aider, Cursor). These runtimes
// take a single prompt with no system channel, so the whole bundle — identity,
// project, user, how to reach TAIA and the kickoff — is rendered into it.
//
// Reference: docs/adr/005-runtime-owned-context-and-settings.md

import {
  renderAgentIdentity,
  renderKickoff,
  renderProjectContext,
  renderTaiaApi,
  renderUserProfile,
} from '../../context-markdown'
import type { SpawnOptions } from '../../types'

/** The prompt to run: `task` as-is without a bundle, the rendered context with one. */
export function renderCliPrompt(
  task: string,
  options?: SpawnOptions,
  taiaBaseUrl?: string,
): string {
  const bundle = options?.context
  if (!bundle) return task
  const sections = [
    renderAgentIdentity(bundle.agent),
    renderProjectContext(bundle.project),
    renderUserProfile(bundle.user),
  ]
  if (taiaBaseUrl) sections.push(renderTaiaApi(bundle.agent.id, taiaBaseUrl))
  sections.push(renderKickoff(bundle, options?.trigger, task))
  return sections.join('\n\n---\n\n')
}
