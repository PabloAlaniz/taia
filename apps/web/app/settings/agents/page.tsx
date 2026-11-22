'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AgentSettingsPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to Squad Dashboard (consolidated agent management)
    router.replace('/squad')
  }, [router])

  return (
    <div className="min-h-full bg-background flex items-center justify-center">
      <span className="text-2xl">🔄 Redirecting to Squad Dashboard...</span>
    </div>
  )
}
