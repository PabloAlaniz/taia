import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Content widths, shared with the page body so the title lines up with it.
 * One rule per kind of page, so widths don't jump when you move between them:
 * - `data`: boards and data pages (sessions, dashboard, audit, project detail).
 * - `medium`: index lists of things (projects, squad, models).
 * - `form`: settings forms and other single-column editors.
 * The body uses the same box: `mx-auto px-4 md:px-6` plus `PAGE_WIDTHS[width]`.
 */
export const PAGE_WIDTHS = {
  data: 'max-w-6xl',
  medium: 'max-w-4xl',
  form: 'max-w-2xl',
  full: 'max-w-none',
} as const

export type PageWidth = keyof typeof PAGE_WIDTHS

export interface PageHeaderProps {
  title: string
  /** @deprecated Emoji icons are gone from the chrome; kept so callers compile. */
  icon?: string
  /** Parent page; shown as a small link above the title. Top-level pages omit it. */
  backHref?: string
  backLabel?: string
  width?: PageWidth
  children?: React.ReactNode
  className?: string
}

/**
 * The page's title row, under the app's top bar. Navigation lives in the top
 * bar, so the back link only appears for pages nested under another page.
 */
export function PageHeader({
  title,
  backHref,
  backLabel,
  width = 'data',
  children,
  className,
}: PageHeaderProps) {
  const showBack = !!backHref && (backHref !== '/' || !!backLabel)
  return (
    // Padding inside the width box, like the page body, so the edges line up.
    <header className={cn('mx-auto px-4 md:px-6 pt-5', PAGE_WIDTHS[width], className)}>
      <div>
        {showBack && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-0.5 text-sm text-muted hover:text-foreground no-underline mb-1"
          >
            <ChevronLeft size={15} aria-hidden="true" />
            {backLabel ?? defaultBackLabel(backHref)}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold leading-tight mr-auto">{title}</h1>
          {children && <div className="flex items-center gap-2">{children}</div>}
        </div>
      </div>
    </header>
  )
}

function defaultBackLabel(href: string): string {
  const segment = href.split('/').filter(Boolean).pop() ?? ''
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}
