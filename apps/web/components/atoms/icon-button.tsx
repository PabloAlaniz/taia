import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const variants = {
  primary: 'bg-accent border-none text-white hover:bg-blue-600',
  secondary: 'bg-background border border-border text-foreground hover:bg-card',
  ghost: 'bg-transparent border-none text-foreground hover:bg-card',
  danger:
    'bg-transparent border border-red-500 text-red-500 hover:bg-red-500/10 hover:text-red-400',
}

const sizes = {
  xs: 'w-5 h-5 text-2xs',
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-sm',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = 'secondary', size = 'sm', className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'relative rounded-md transition-colors cursor-pointer inline-flex items-center justify-center p-0',
          // Invisible touch target expansion for mobile (44x44 min)
          'before:absolute before:inset-0 before:-m-1.5 before:content-[""] md:before:hidden',
          'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:outline-hidden',
          'disabled:opacity-50 disabled:cursor-not-allowed',
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
