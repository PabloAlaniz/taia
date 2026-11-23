'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { html as diff2html } from 'diff2html'
import type { DiffResult } from '@taia/types'
import { Badge, Button } from '../atoms'
import { Modal } from '../molecules/modal'

interface DiffViewerProps {
  diff: DiffResult
  onClose: () => void
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function DiffViewer({ diff, onClose }: DiffViewerProps) {
  const t = useTranslations('diffViewer')
  const tw = useTranslations('worktree')
  const noChanges = t('noChanges')
  const [viewMode, setViewMode] = useState<'line-by-line' | 'side-by-side'>('line-by-line')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const diffHtml = useMemo(() => {
    if (!diff.unified_diff) return `<p class="text-muted">${escapeHtml(noChanges)}</p>`
    try {
      return diff2html(diff.unified_diff, {
        drawFileList: false,
        matching: 'lines',
        outputFormat: viewMode,
      })
    } catch {
      return `<pre>${escapeHtml(diff.unified_diff)}</pre>`
    }
  }, [diff.unified_diff, viewMode, noChanges])

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <Modal open={true} onClose={onClose} size="xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{t('title')}</h2>
          <Badge variant="secondary" size="sm">
            {tw('filesChanged', { count: diff.stats.files_changed })}
          </Badge>
          <span
            className="text-xs text-ok"
            title={t('insertions', { count: diff.stats.insertions })}
          >
            +{diff.stats.insertions}
          </span>
          <span
            className="text-xs text-alert"
            title={t('deletions', { count: diff.stats.deletions })}
          >
            -{diff.stats.deletions}
          </span>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label={t('viewMode')}>
          <Button
            variant={viewMode === 'line-by-line' ? 'primary' : 'ghost'}
            size="xs"
            aria-pressed={viewMode === 'line-by-line'}
            onClick={() => setViewMode('line-by-line')}
          >
            {t('unified')}
          </Button>
          <Button
            variant={viewMode === 'side-by-side' ? 'primary' : 'ghost'}
            size="xs"
            aria-pressed={viewMode === 'side-by-side'}
            onClick={() => setViewMode('side-by-side')}
          >
            {t('sideBySide')}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={onClose}
            className="ml-2 text-muted hover:text-foreground"
            aria-label={t('close')}
            title={t('close')}
          >
            <X size={16} aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File list sidebar */}
        <div className="w-64 border-r border-border overflow-y-auto p-2 shrink-0">
          <p className="text-2xs text-muted uppercase font-medium mb-2 px-2">{t('files')}</p>
          {diff.stats.files.map((file) => (
            <Button
              key={file.path}
              variant="ghost"
              size="sm"
              onClick={() => setSelectedFile(selectedFile === file.path ? null : file.path)}
              className={`w-full text-left truncate ${
                selectedFile === file.path ? 'bg-background text-foreground' : 'text-muted'
              }`}
              title={file.path}
            >
              <span
                aria-hidden
                className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                  file.status === 'added'
                    ? 'bg-ok'
                    : file.status === 'deleted'
                      ? 'bg-alert'
                      : 'bg-person-ink'
                }`}
              />
              <span className="sr-only">{t('fileStatus', { status: file.status })}: </span>
              {file.path.split('/').pop()}
              <span className="text-2xs text-muted ml-1">
                +{file.insertions} -{file.deletions}
              </span>
            </Button>
          ))}

          {/* Commits section */}
          {diff.commits.length > 0 && (
            <>
              <p className="text-2xs text-muted uppercase font-medium mt-4 mb-2 px-2">
                {t('commits', { count: diff.commits.length })}
              </p>
              {diff.commits.map((commit) => (
                <div key={commit.hash} className="px-2 py-1.5 text-xs">
                  <span className="text-accent font-mono text-2xs">{commit.short_hash}</span>
                  <p className="text-muted truncate" title={commit.message}>
                    {commit.message}
                  </p>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto">
          <div
            className="diff-viewer-content p-4 text-xs font-mono"
            dangerouslySetInnerHTML={{ __html: diffHtml }}
          />
        </div>
      </div>
    </Modal>
  )
}
