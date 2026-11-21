import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          'w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm',
          'focus-visible:outline-hidden focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 transition-colors',
          error && 'border-red-500 focus:border-red-500',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    )
  },
)

Select.displayName = 'Select'
