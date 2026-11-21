import { useTranslations } from 'next-intl'

export interface SkipLinkProps {
  href?: string
  children?: React.ReactNode
}

export function SkipLink({ href = '#main-content', children }: SkipLinkProps) {
  const t = useTranslations('common')
  const label = children || t('skipToContent')
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-accent focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:text-sm"
    >
      {label}
    </a>
  )
}
