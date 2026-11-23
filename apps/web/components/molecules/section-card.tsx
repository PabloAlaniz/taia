import { cn } from '../../lib/utils'
import { Strip } from '../atoms/strip'
import { RackSection } from './rack-section'

export interface SectionCardProps {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  contentClassName?: string
  className?: string
}

/**
 * A titled form section in the rack grammar: the title is the rack's label and
 * the content sits on one strip-paper panel, so there is no card in a card.
 */
export function SectionCard({
  title,
  description,
  action,
  children,
  contentClassName,
  className,
}: SectionCardProps) {
  return (
    <RackSection title={title} aside={action} className={className}>
      <Strip className={cn('p-4 space-y-4', contentClassName)}>
        {description && <p className="text-sm text-muted">{description}</p>}
        {children}
      </Strip>
    </RackSection>
  )
}
