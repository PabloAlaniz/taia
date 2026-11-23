'use client'

import { useTranslations } from 'next-intl'
import { approvalExtras, approvalPayload } from '../../lib/approval-detail'

/**
 * The content an approval would write, readable before deciding: a Write's
 * text, or an Edit's before/after pairs, then any other parameters.
 */
export function ApprovalPayloadView({ input }: { input: Record<string, unknown> | null }) {
  const t = useTranslations('approvalPayload')
  const payload = approvalPayload(input)
  const extras = approvalExtras(input)
  if (!payload && !extras) return null
  return (
    <div className="mt-2 space-y-2">
      {payload?.kind === 'write' && (
        <figure>
          <figcaption className="text-xs text-muted mb-1">
            {t('writes', { lines: payload.lines })}
          </figcaption>
          <pre
            // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be keyboard reachable
            tabIndex={0}
            className="font-mono text-xs bg-strip px-2 py-1.5 rounded-[2px] whitespace-pre-wrap break-all max-h-72 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            {payload.text}
          </pre>
        </figure>
      )}
      {payload?.kind === 'edit' &&
        payload.edits.map((edit, i) => (
          <figure key={i} className="grid gap-1 sm:grid-cols-2">
            <figcaption className="sm:col-span-2 text-xs text-muted">
              {payload.edits.length > 1
                ? t('editN', { n: i + 1, total: payload.edits.length })
                : t('edit')}
            </figcaption>
            <div>
              <p className="text-xxs font-semibold uppercase tracking-[0.08em] text-alert mb-0.5">
                {t('before')}
              </p>
              <pre className="font-mono text-xs bg-strip px-2 py-1.5 rounded-[2px] whitespace-pre-wrap break-all max-h-48 overflow-auto border-l-2 border-alert">
                {edit.before || '—'}
              </pre>
            </div>
            <div>
              <p className="text-xxs font-semibold uppercase tracking-[0.08em] text-ok mb-0.5">
                {t('after')}
              </p>
              <pre className="font-mono text-xs bg-strip px-2 py-1.5 rounded-[2px] whitespace-pre-wrap break-all max-h-48 overflow-auto border-l-2 border-ok">
                {edit.after || '—'}
              </pre>
            </div>
          </figure>
        ))}
      {extras && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted hover:text-foreground">
            {t('allParams')}
          </summary>
          <pre className="mt-1 font-mono bg-strip px-2 py-1.5 rounded-[2px] whitespace-pre-wrap break-all max-h-48 overflow-auto">
            {JSON.stringify(extras, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
