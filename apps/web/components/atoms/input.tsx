import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  variant?: 'default' | 'mono'
}

const variants = {
  default: '',
  mono: 'font-mono',
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, variant = 'default', className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm',
          'focus-visible:outline-hidden focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 transition-colors',
          variants[variant],
          error && 'border-red-500 focus:border-red-500',
          className,
        )}
        {...props}
      />
    )
  },
)

Input.displayName = 'Input'
