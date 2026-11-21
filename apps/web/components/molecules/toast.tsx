import { cn } from '../../lib/utils'

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'warning' | 'error' | 'success' | 'info'
  position?: 'top-center' | 'top-right' | 'bottom-center'
}

const variants = {
  warning: 'bg-yellow-500/90 text-yellow-950',
  error: 'bg-red-500/90 text-white',
  success: 'bg-green-500/90 text-white',
  info: 'bg-accent/90 text-white',
}

const positions = {
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'top-right': 'top-4 right-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
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
      role="alert"
      className={cn(
        'fixed z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-[slideUp_200ms_ease-out]',
        variants[variant],
        positions[position],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
