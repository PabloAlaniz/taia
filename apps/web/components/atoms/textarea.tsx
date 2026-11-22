import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
  variant?: 'default' | 'mono'
  resizable?: boolean
}

const variants = {
  default: '',
  mono: 'font-mono text-mid leading-relaxed',
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, variant = 'default', resizable = false, className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full px-3 py-2 bg-card border border-field rounded text-foreground text-sm',
          resizable ? 'resize-y' : 'resize-none',
          'focus-visible:outline-hidden focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 transition-colors',
          variants[variant],
          error && 'border-alert focus:border-alert',
          className,
        )}
        {...props}
      />
    )
  },
)

Textarea.displayName = 'Textarea'
