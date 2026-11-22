'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export default function AgentSettingsPage() {
  const router = useRouter()
  const t = useTranslations('settingsIndex')

  useEffect(() => {
    // Agent management lives on the Squad page.
    router.replace('/squad')
  }, [router])

  return (
    <div className="min-h-full bg-background flex items-center justify-center">
      <span className="text-sm text-muted" role="status">
        {t('redirectingAgents')}
      </span>
    </div>
  )
}
