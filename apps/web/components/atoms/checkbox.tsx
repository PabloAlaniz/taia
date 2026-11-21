import { forwardRef, useId } from 'react'
import { cn } from '../../lib/utils'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  description?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, id, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id || generatedId

    if (label || description) {
      return (
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            ref={ref}
            type="checkbox"
            id={inputId}
            className={cn(
              'w-4 h-4 mt-0.5 rounded-sm border-border accent-accent cursor-pointer',
              className,
            )}
            {...props}
          />
          <div>
            {label && <span className="text-sm">{label}</span>}
            {description && <p className="text-xs text-muted">{description}</p>}
          </div>
        </label>
      )
    }

    return (
      <input
        ref={ref}
        type="checkbox"
        id={inputId}
        className={cn('w-4 h-4 rounded-sm border-border accent-accent cursor-pointer', className)}
        {...props}
      />
    )
  },
)

Checkbox.displayName = 'Checkbox'
