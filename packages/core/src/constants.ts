export const SYSTEM_ACTORS = ['mcp', 'cli', 'web-ui', 'planning-wizard', 'system'] as const
export type SystemActor = (typeof SYSTEM_ACTORS)[number]
export function isSystemActor(id: string): boolean {
  return SYSTEM_ACTORS.includes(id as SystemActor)
}
