import { Label } from '@/components/atoms'

/** The API's id rule (CreateAgentSchema): lowercase, digits, dash, underscore, 1-50. */
export const ID_PATTERN = /^[a-z0-9_-]{1,50}$/

/**
 * An id from a display name: "Lucía Pérez" → "lucia-perez". Accents are folded,
 * anything else becomes a dash, and the result fits the API's id rule.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '')
}

/** Keeps only the characters an id may hold, as the user types. */
export function cleanId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

export type IdProblem = 'idRequired' | 'idInvalid' | 'idTaken' | null

export function idProblem(id: string, takenIds: readonly string[] = []): IdProblem {
  if (!id) return 'idRequired'
  if (!ID_PATTERN.test(id)) return 'idInvalid'
  if (takenIds.includes(id)) return 'idTaken'
  return null
}

export interface FieldControlProps {
  id: string
  'aria-invalid': true | undefined
  'aria-describedby': string | undefined
  error: boolean
}

/**
 * Label, control, hint and error wired together: the error sits right under
 * its field, and the control points at both the hint and the error.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string | null
  children: (control: FieldControlProps) => React.ReactNode
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
  return (
    <div>
      {/* Required is the default; optional fields say so in their label. */}
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        error: !!error,
      })}
      {error && (
        <p id={errorId} className="text-xs font-medium text-alert mt-1">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-xs text-muted mt-1">
          {hint}
        </p>
      )}
    </div>
  )
}
