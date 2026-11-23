import { cn } from '../../lib/utils'

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
}

export function Label({ required, className, children, ...props }: LabelProps) {
  return (
    <label className={cn('text-xs text-muted block mb-1', className)} {...props}>
      {children}
      {required && (
        <span className="text-alert ml-0.5" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
}
