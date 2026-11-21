// Task-related utility functions — consolidated from task-sidebar, calendar-view, dashboard

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function parseTimeInput(value: string): number | null {
  const trimmed = value.trim().toLowerCase()

  // Pure number = minutes
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed)

  // "2h", "2h30m", "2h 30m", "30m"
  const match = trimmed.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/)
  if (match && (match[1] || match[2])) {
    const hours = parseInt(match[1] || '0')
    const mins = parseInt(match[2] || '0')
    return hours * 60 + mins
  }

  return null
}

export function isOverdue(dueDate: string): boolean {
  return new Date(dueDate) < new Date()
}

export function formatTaskDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

export function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
