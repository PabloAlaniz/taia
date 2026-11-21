import { cn } from '../../lib/utils'

export interface BackdropProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'center' | 'top'
}

const alignments = {
  center: 'flex items-center justify-center',
  top: 'flex items-start justify-center pt-20',
}

export function Backdrop({ align = 'center', className, children, ...props }: BackdropProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 bg-black/50 z-50 overscroll-contain animate-[fadeIn_150ms_ease-out]',
        alignments[align],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
