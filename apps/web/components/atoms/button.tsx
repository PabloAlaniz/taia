import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
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
          'rounded-md font-medium transition-colors cursor-pointer',
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

Button.displayName = 'Button'
