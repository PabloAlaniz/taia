import { cn } from '../../lib/utils'

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'warning' | 'error' | 'success' | 'info'
  position?: 'top-center' | 'top-right' | 'bottom-center'
}

// A strip that floats: ink on card, the state carried by the edge tab, so the
// text reads in both themes whatever the state.
const tabs = {
  warning: 'before:bg-person',
  error: 'before:bg-alert',
  success: 'before:bg-ok',
  info: 'before:bg-agent',
}

const positions = {
  'top-center': 'top-16 left-1/2 -translate-x-1/2',
  'top-right': 'top-16 right-4',
  'bottom-center': 'bottom-16 md:bottom-4 left-1/2 -translate-x-1/2',
}

export function Toast({
  variant = 'warning',
  position = 'top-center',
  className,
  children,
  ...props
}: ToastProps) {
  return (
    <div
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      className={cn(
        'fixed z-50 max-w-[min(32rem,calc(100vw-2rem))] pl-5 pr-4 py-2.5 rounded-[2px]',
        'bg-card text-foreground text-sm font-medium border border-border',
        'shadow-[0_8px_20px_rgba(0,0,0,0.22)] animate-[slideUp_200ms_ease-out]',
        'before:absolute before:inset-y-0 before:left-0 before:w-[5px] before:rounded-l-[2px] before:content-[""]',
        tabs[variant],
        positions[position],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
