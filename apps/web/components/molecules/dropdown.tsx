import { cn } from '../../lib/utils'

export interface DropdownProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean
  align?: 'left' | 'right'
}

export function Dropdown({ open, align = 'left', className, ...props }: DropdownProps) {
  if (!open) return null

  return (
    <div
      className={cn(
        'absolute top-full mt-1 bg-card text-foreground border border-border rounded-md shadow-[0_6px_16px_rgba(0,0,0,0.22)] z-30',
        align === 'left' ? 'left-0' : 'right-0',
        className,
      )}
      {...props}
    />
  )
}
