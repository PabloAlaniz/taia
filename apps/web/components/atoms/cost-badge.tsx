'use client'

import { useLocale, useTranslations } from 'next-intl'
import { formatTokens, formatUsd } from '../../lib/format'
import { Badge } from './badge'

interface CostBadgeProps {
  costUsd: number
  tokens?: number
  className?: string
}

/** Spend in the user's locale, with tokens when known: "$1,08 · 14,2K tokens". */
export function CostBadge({ costUsd, tokens, className }: CostBadgeProps) {
  const locale = useLocale()
  const t = useTranslations('costBadge')
  const cost = formatUsd(locale, costUsd)
  return (
    <Badge variant="muted" size="sm" className={className}>
      {tokens ? t('withTokens', { cost, tokens: formatTokens(tokens) }) : cost}
    </Badge>
  )
}
