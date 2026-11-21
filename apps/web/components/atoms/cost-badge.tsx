'use client'

import { Badge } from './badge'

interface CostBadgeProps {
  costUsd: number
  tokens?: number
  className?: string
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}

export function CostBadge({ costUsd, tokens, className }: CostBadgeProps) {
  const label = tokens
    ? `${formatCost(costUsd)} · ${formatTokens(tokens)} tok`
    : formatCost(costUsd)

  return (
    <Badge variant="muted" size="sm" className={className}>
      {label}
    </Badge>
  )
}
