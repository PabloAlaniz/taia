import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Our micro font sizes (globals.css --text-*) must read as sizes, not colours:
// otherwise `text-xxs` would knock out `text-background` in the same class list.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['3xs', '2xs', 'xxs', 'mid'] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeUntil(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  if (diffMs < 0) return 'now'
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `in ${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  return `in ${diffHours}h`
}

export function formatRelativeTime(iso: string): string {
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T')
  const withTz =
    normalized.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + 'Z'
  const date = new Date(withTz)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

/** Link to a session's transcript; the instance spares the lookup of its owner. */
export function sessionHref(sessionKey: string, instanceId?: string): string {
  const query = instanceId ? `?instance=${encodeURIComponent(instanceId)}` : ''
  return `/sessions/${encodeURIComponent(sessionKey)}${query}`
}
