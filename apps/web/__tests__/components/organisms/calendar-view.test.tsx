// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Task } from '@taia/types'

import { CalendarView, formatDateKey } from '@/components/organisms/calendar-view'
import { useStore } from '@/lib/store'

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key
    return t
  },
  useFormatter: () => ({
    dateTime: (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', opts),
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const todayKey = formatDateKey(new Date())

function task(over: Partial<Task>): Task {
  return {
    id: 't',
    title: 'Task',
    status: 'TODO',
    priority: 'MEDIUM',
    due_date: `${todayKey}T12:00:00Z`,
    ...over,
  } as Task
}

beforeEach(() => {
  useStore.setState({
    agents: [
      { id: 'a1', name: 'Builder', type: 'api' },
      { id: 'h1', name: 'Ana', type: 'human' },
    ],
    boardColumns: [{ slug: 'TODO', label: 'Por hacer' }],
  } as never)
})

describe('CalendarView', () => {
  it('marks today with aria-current and a word, not colour alone', () => {
    render(<CalendarView tasks={[]} />)
    const today = screen.getByRole('button', { current: 'date' })
    expect(today).toHaveTextContent('todayTag')
  })

  it('lists the day with participant names and priority in words', () => {
    render(
      <CalendarView
        tasks={[
          task({ id: '1', title: 'Fix login', priority: 'URGENT', assigned_to: 'h1' }),
          task({ id: '2', title: 'Write docs', priority: 'HIGH', assigned_to: 'a1' }),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { current: 'date' }))
    expect(screen.getByRole('link', { name: /Fix login/ })).toHaveAttribute('href', '/task/1')
    expect(screen.getByText('urgent')).toHaveClass('text-alert')
    expect(screen.getByText('high')).not.toHaveClass('text-alert')
    expect(screen.getByText('Ana')).toHaveClass('text-person-ink')
    expect(screen.getByText('Builder')).toHaveClass('text-agent-ink')
  })

  it('folds tasks beyond two into a count', () => {
    render(<CalendarView tasks={['1', '2', '3', '4'].map((id) => task({ id, title: `T${id}` }))} />)
    expect(screen.getByText('moreTasks {"count":2}')).toBeInTheDocument()
  })
})
