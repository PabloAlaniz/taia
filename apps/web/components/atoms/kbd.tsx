import { cn } from '../../lib/utils'

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode
}

export function Kbd({ className, children, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        'px-1 py-0.5 bg-card rounded-sm font-mono border border-border text-[inherit] inline-block',
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  )
}
