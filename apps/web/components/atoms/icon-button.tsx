import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const variants = {
  primary: 'bg-foreground border border-foreground text-background hover:opacity-90',
  secondary: 'bg-card border border-border text-foreground hover:bg-strip',
  ghost: 'bg-transparent border border-transparent text-muted hover:text-foreground hover:bg-strip',
  danger: 'bg-card border border-alert/50 text-alert hover:bg-alert/10',
}

const sizes = {
  xs: 'w-5 h-5 text-2xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-10 h-10 text-sm',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = 'secondary', size = 'sm', className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'relative rounded transition-colors cursor-pointer inline-flex items-center justify-center p-0',
          // Invisible touch target expansion for mobile (44x44 min)
          'before:absolute before:inset-0 before:-m-1.5 before:content-[""] md:before:hidden',
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

IconButton.displayName = 'IconButton'
