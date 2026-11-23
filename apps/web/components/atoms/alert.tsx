import { cn } from '../../lib/utils'

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant: 'error' | 'success' | 'warning' | 'info'
}

// Ink-strength text on a faint tint of the same state, with a 5px edge tab:
// the strip grammar, and every variant clears 4.5:1 in both themes.
const variants = {
  error: 'bg-alert/8 text-alert before:bg-alert',
  success: 'bg-ok/8 text-ok before:bg-ok',
  warning: 'bg-person/10 text-person-ink before:bg-person',
  info: 'bg-agent/8 text-agent-ink before:bg-agent',
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
      className={cn(
        'relative pl-4 pr-3 py-2.5 rounded-[2px] text-sm font-medium',
        'before:absolute before:inset-y-0 before:left-0 before:w-[5px] before:rounded-l-[2px] before:content-[""]',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
