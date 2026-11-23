/**
 * What an approval asks for, beyond its tool name. The subject is the one
 * line that names the target (a command, a path, a URL); the payload is
 * what the tool would write, when there is something to read before saying
 * yes (a Write's content, an Edit's replacements).
 */
export type ApprovalPayload =
  | { kind: 'write'; text: string; lines: number }
  | { kind: 'edit'; edits: { before: string; after: string }[]; lines: number }

const SUBJECT_KEYS = ['command', 'cmd', 'path', 'file_path', 'url'] as const

export function approvalSubject(input: Record<string, unknown> | null | undefined): string | null {
  if (!input) return null
  for (const key of SUBJECT_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value) return value
  }
  return null
}

const countLines = (s: string) => (s ? s.split('\n').length : 0)

export function approvalPayload(
  input: Record<string, unknown> | null | undefined,
): ApprovalPayload | null {
  if (!input) return null
  if (typeof input.content === 'string') {
    return { kind: 'write', text: input.content, lines: countLines(input.content) }
  }
  const pairs: { before: string; after: string }[] = []
  if (typeof input.old_string === 'string' || typeof input.new_string === 'string') {
    pairs.push({ before: String(input.old_string ?? ''), after: String(input.new_string ?? '') })
  }
  if (Array.isArray(input.edits)) {
    for (const e of input.edits as Record<string, unknown>[]) {
      if (e && (typeof e.old_string === 'string' || typeof e.new_string === 'string')) {
        pairs.push({ before: String(e.old_string ?? ''), after: String(e.new_string ?? '') })
      }
    }
  }
  if (pairs.length === 0) return null
  const lines = pairs.reduce((n, p) => n + countLines(p.before) + countLines(p.after), 0)
  return { kind: 'edit', edits: pairs, lines }
}

/** Everything else the tool received, for the "all parameters" disclosure. */
export function approvalExtras(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!input) return null
  const skip = new Set<string>([...SUBJECT_KEYS, 'content', 'old_string', 'new_string', 'edits'])
  const rest = Object.fromEntries(Object.entries(input).filter(([k]) => !skip.has(k)))
  return Object.keys(rest).length > 0 ? rest : null
}
