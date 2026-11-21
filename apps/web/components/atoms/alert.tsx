import { cn } from '../../lib/utils'

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant: 'error' | 'success' | 'warning' | 'info'
}

const variants = {
  error: 'bg-red-500/5 border border-red-500/20 text-red-400',
  success: 'bg-green-500/10 border border-green-500/20 text-green-400',
  warning: 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400',
  info: 'bg-accent/10 border border-accent/20 text-accent',
}

const roles: Record<AlertProps['variant'], string> = {
  error: 'alert',
  success: 'status',
  warning: 'alert',
  info: 'status',
}

export function Alert({ variant, className, ...props }: AlertProps) {
  return (
    <div
      role={roles[variant]}
      className={cn('p-2.5 rounded-lg text-sm', variants[variant], className)}
      {...props}
    />
  )
}
