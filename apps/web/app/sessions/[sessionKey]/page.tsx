'use client'

import { use } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { TranscriptViewer } from '@/components/organisms/transcript-viewer'

export default function SessionDetailPage({ params }: { params: Promise<{ sessionKey: string }> }) {
  const { sessionKey } = use(params)
  const decodedKey = decodeURIComponent(sessionKey)
  const instanceId = useSearchParams().get('instance') ?? undefined

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="h-10 bg-card border-b border-border flex items-center px-4 shrink-0">
        <Link href="/sessions" className="text-xs text-muted hover:text-foreground no-underline">
          ← Sesiones
        </Link>
        <span className="text-xs text-muted ml-3 truncate">{decodedKey}</span>
      </header>

      {/* Transcript viewer fills remaining space */}
      <div className="flex-1 relative overflow-hidden">
        <TranscriptViewer sessionKey={decodedKey} instanceId={instanceId} />
      </div>
    </div>
  )
}
