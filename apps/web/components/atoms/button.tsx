import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const variants = {
  primary: 'bg-foreground border border-foreground text-background hover:opacity-90',
  secondary: 'bg-card border border-border text-foreground hover:bg-strip',
  ghost: 'bg-transparent border border-transparent text-foreground hover:bg-strip',
  danger: 'bg-card border border-alert/50 text-alert hover:bg-alert/10',
}

const sizes = {
  xs: 'px-2 py-1 text-xxs',
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'sm', className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'rounded font-semibold transition-colors cursor-pointer',
          'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:outline-hidden',
          // Disabled reads as a flat strip with muted ink, not a 50% ghost.
          'disabled:cursor-not-allowed disabled:bg-strip disabled:text-muted disabled:border-border disabled:opacity-100',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'
