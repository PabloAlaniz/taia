import type { UserSlice, SliceCreator } from '../types'

function getStoredUserId(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('taia-current-user')
  }
  return null
}

export const createUserSlice: SliceCreator<UserSlice> = (set) => ({
  currentUserId: getStoredUserId(),

  setCurrentUser: (agentId: string | null) => {
    if (typeof window !== 'undefined') {
      if (agentId) {
        localStorage.setItem('taia-current-user', agentId)
      } else {
        localStorage.removeItem('taia-current-user')
      }
    }
    set({ currentUserId: agentId })
  },
})
