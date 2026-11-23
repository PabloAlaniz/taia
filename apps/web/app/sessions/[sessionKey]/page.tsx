'use client'

import { use } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { TranscriptViewer } from '@/components/organisms/transcript-viewer'

export default function SessionDetailPage({ params }: { params: Promise<{ sessionKey: string }> }) {
  const t = useTranslations('sessionDetail')
  const { sessionKey } = use(params)
  const decodedKey = decodeURIComponent(sessionKey)
  const instanceId = useSearchParams().get('instance') ?? undefined

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="h-10 bg-card border-b border-border flex items-center px-4 shrink-0">
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground no-underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {t('back')}
        </Link>
        <span
          className="text-xs text-muted ml-3 truncate"
          title={t('sessionKey', { key: decodedKey })}
        >
          {decodedKey}
        </span>
      </header>

      {/* Transcript viewer fills remaining space */}
      <div className="flex-1 relative overflow-hidden">
        <TranscriptViewer sessionKey={decodedKey} instanceId={instanceId} />
      </div>
    </div>
  )
}
