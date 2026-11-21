// Agent metadata — generic defaults (no hardcoded agent data)
// Real metadata comes from the DB (agents table) and the active runtime adapter

export interface AgentMetadata {
  name: string
  role: string
  avatar: string
}

export function getDefaultName(id: string): string {
  return id
}

export function getDefaultRole(_id: string): string {
  return 'Agent'
}

export function getDefaultAvatar(_id: string): string {
  return '🤖'
}

export function getAgentDisplay(agentId: string): string {
  return agentId
}

// Fallback agents — empty, the store handles [] as valid initial state
export function getFallbackAgents(): {
  id: string
  name: string
  role: string
  avatar: string
  status: 'IDLE'
}[] {
  return []
}
