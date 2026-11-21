export interface SquadMember {
  id: string
  name: string
  role?: string
  avatar?: string
  model?: string
  toolsDenied?: string[]
  type: string
  enabled: boolean
  cron?: {
    id: string
    enabled: boolean
    schedule: string
    scheduleRaw?: string
    nextRun?: string
    lastRun?: string
    lastStatus?: string
    lastError?: string
    lastDurationMs?: number
  }
  context?: {
    persona: boolean
    instructions: boolean
    workingNotes: boolean
    memoryFiles: string[]
  }
  tasks: {
    assigned: number
    inProgress: number
    review: number
    done: number
  }
}
