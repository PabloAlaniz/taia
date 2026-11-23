'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Task } from '@taia/types'
import { cn } from '../../lib/utils'
import { useStore } from '../../lib/store'
import { Button, IconButton } from '../atoms'
import { ParticipantMark } from '../atoms/participant-mark'
import { Strip, type StripKind } from '../atoms/strip'
import { RackSection } from '../molecules/rack-section'

interface CalendarViewProps {
  tasks: Task[]
}

/** A week that starts on Sunday, to name the weekdays in the reader's locale. */
const REFERENCE_WEEK = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i))

/** Task chips a day cell shows before it folds the rest into "+n". */
const CHIPS_PER_DAY = 2

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

/** YYYY-MM-DD in local time, the same shape as the date part of `due_date`. */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const isDone = (task: Task) => task.status === 'DONE'

/** Urgent and high read heavier; colour is left to the participant tab. */
const isPressing = (task: Task) => task.priority === 'URGENT' || task.priority === 'HIGH'

export function CalendarView({ tasks }: CalendarViewProps) {
  const t = useTranslations('calendarUi')
  const format = useFormatter()
  const agents = useStore((s) => s.agents)
  const boardColumns = useStore((s) => s.boardColumns)
  const columnLabel = (slug: string) => boardColumns.find((c) => c.slug === slug)?.label ?? slug
  const agentOf = (id: string) => agents.find((a) => a.id === id)
  const agentName = (id: string) => agentOf(id)?.name ?? id
  const kindOf = (task: Task): StripKind => {
    if (!task.assigned_to) return 'none'
    return agentOf(task.assigned_to)?.type === 'human' ? 'person' : 'agent'
  }
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Group tasks by due date
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    tasks.forEach((task) => {
      if (task.due_date) {
        const dateKey = task.due_date.split('T')[0]
        const existing = map.get(dateKey) || []
        map.set(dateKey, [...existing, task])
      }
    })
    return map
  }, [tasks])

  // Calendar grid data - always 6 rows for consistent height
  const calendarWeeks = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    const weeks: (number | null)[][] = []
    let currentWeek: (number | null)[] = []

    for (let i = 0; i < firstDay; i++) {
      currentWeek.push(null)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day)
      if (currentWeek.length === 7) {
        weeks.push(currentWeek)
        currentWeek = []
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null)
      }
      weeks.push(currentWeek)
    }

    while (weeks.length < 6) {
      weeks.push([null, null, null, null, null, null, null])
    }

    return weeks
  }, [year, month])

  const today = new Date()
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDay(null)
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDay(null)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDay(null)
  }

  const getDateKey = (day: number) => formatDateKey(new Date(year, month, day))

  const monthPrefix = formatDateKey(new Date(year, month, 1)).slice(0, 8)
  const monthCount = useMemo(() => {
    let n = 0
    tasksByDate.forEach((list, key) => {
      if (key.startsWith(monthPrefix)) n += list.length
    })
    return n
  }, [tasksByDate, monthPrefix])

  const selectedDayTasks = selectedDay ? tasksByDate.get(selectedDay) || [] : []

  const priorityWord = (task: Task) => {
    if (task.priority === 'URGENT') {
      return (
        <span className={cn('font-semibold', isDone(task) ? 'text-muted' : 'text-alert')}>
          {t('urgent')}
        </span>
      )
    }
    if (task.priority === 'HIGH') {
      return <span className="font-semibold text-foreground">{t('high')}</span>
    }
    return null
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Month controls and legend, on the page side of the rack */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <IconButton variant="ghost" size="sm" onClick={goToPrevMonth} aria-label={t('prevMonth')}>
            <ChevronLeft size={16} aria-hidden />
          </IconButton>
          <IconButton variant="ghost" size="sm" onClick={goToNextMonth} aria-label={t('nextMonth')}>
            <ChevronRight size={16} aria-hidden />
          </IconButton>
          <Button variant="secondary" size="sm" onClick={goToToday} className="ml-1">
            {t('today')}
          </Button>
        </div>
        <ul
          className="ml-auto flex items-center gap-4 text-mid text-muted"
          aria-label={t('legend')}
        >
          <li className="flex items-center gap-1.5">
            <ParticipantMark agent={{ type: 'api' }} />
            {t('legendAgent')}
          </li>
          <li className="flex items-center gap-1.5">
            <ParticipantMark agent={{ type: 'human' }} />
            {t('legendPerson')}
          </li>
        </ul>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 items-start">
        {/* The month as a rack; each day is a slot that holds the strips due that day */}
        <RackSection
          id="calendar-month"
          title={format.dateTime(currentDate, { month: 'long', year: 'numeric' })}
          count={monthCount}
          className="w-full lg:flex-1 min-w-0"
        >
          {monthCount === 0 ? (
            // Nothing due this month: one line, not a month of empty slots.
            <Strip className="px-4 py-3">
              <p className="text-sm font-semibold">{t('monthEmpty')}</p>
              <p className="text-xs text-muted mt-0.5">{t('monthEmptyHint')}</p>
            </Strip>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1" aria-hidden="true">
                {REFERENCE_WEEK.map((day) => (
                  <div
                    key={day.getDay()}
                    className="text-center text-xs font-medium text-on-rack-muted first-letter:uppercase"
                  >
                    {format.dateTime(day, { weekday: 'short' })}
                  </div>
                ))}
              </div>

              {calendarWeeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 gap-1">
                  {week.map((day, dayIndex) => {
                    if (day === null) {
                      return (
                        <div
                          key={`empty-${weekIndex}-${dayIndex}`}
                          className="min-h-12 md:min-h-24"
                        />
                      )
                    }

                    const dateKey = getDateKey(day)
                    const dayTasks = tasksByDate.get(dateKey) || []
                    const isSelected = selectedDay === dateKey
                    const todayCell = isToday(day)
                    const shown = dayTasks.slice(0, CHIPS_PER_DAY)
                    const hidden = dayTasks.length - shown.length

                    return (
                      // eslint-disable-next-line no-restricted-syntax -- a day slot on the rack, not an action button
                      <button
                        key={day}
                        type="button"
                        onClick={() => setSelectedDay(isSelected ? null : dateKey)}
                        aria-pressed={isSelected}
                        aria-current={todayCell ? 'date' : undefined}
                        aria-label={t('dayAria', {
                          date: format.dateTime(new Date(year, month, day), {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          }),
                          count: dayTasks.length,
                        })}
                        className={cn(
                          'min-h-12 md:min-h-24 min-w-0 p-1 rounded-[3px] text-left flex flex-col gap-1 cursor-pointer',
                          'bg-rack-deep text-on-rack transition-colors hover:bg-rack-line',
                          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white',
                          todayCell && 'shadow-[inset_0_0_0_1px_var(--on-rack-muted)]',
                          isSelected && 'bg-rack-line shadow-[inset_0_0_0_2px_var(--rack-heading)]',
                        )}
                      >
                        <span className="flex items-baseline gap-1 min-w-0 text-xs leading-none px-0.5 pt-0.5">
                          <span
                            className={cn(
                              'tabular-nums',
                              todayCell ? 'font-bold text-rack-heading' : 'font-medium',
                            )}
                          >
                            {day}
                          </span>
                          {todayCell && (
                            <span
                              aria-hidden="true"
                              className="truncate font-semibold text-rack-heading"
                            >
                              {t('todayTag')}
                            </span>
                          )}
                        </span>

                        {dayTasks.length > 0 && (
                          <>
                            {/* Narrow cells only fit the count */}
                            <span
                              aria-hidden="true"
                              className="md:hidden mt-auto text-xs font-semibold tabular-nums px-0.5"
                            >
                              {dayTasks.length}
                            </span>
                            <span
                              aria-hidden="true"
                              className="hidden md:flex flex-col gap-1 min-w-0"
                            >
                              {shown.map((task) => (
                                <Strip
                                  key={task.id}
                                  kind={kindOf(task)}
                                  quiet={isDone(task)}
                                  title={task.title}
                                  className="pl-2.5 pr-1.5 py-0.5"
                                >
                                  <span
                                    className={cn(
                                      'block truncate text-xs leading-snug',
                                      isDone(task)
                                        ? 'text-muted line-through'
                                        : isPressing(task)
                                          ? 'font-semibold text-foreground'
                                          : 'text-foreground',
                                    )}
                                  >
                                    {task.title}
                                  </span>
                                </Strip>
                              ))}
                              {hidden > 0 && (
                                <span className="text-xs text-on-rack-muted px-0.5">
                                  {t('moreTasks', { count: hidden })}
                                </span>
                              )}
                            </span>
                          </>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </>
          )}
        </RackSection>

        {/* Selected day */}
        <section
          aria-labelledby={selectedDay ? 'calendar-day-heading' : undefined}
          className={cn(
            'w-full lg:w-72 shrink-0 bg-card border border-border rounded-md p-3 flex flex-col gap-2 lg:sticky lg:top-4',
            !selectedDay && (monthCount === 0 ? 'hidden' : 'hidden lg:flex'),
          )}
        >
          {selectedDay ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h3
                  id="calendar-day-heading"
                  className="font-semibold text-sm first-letter:uppercase"
                >
                  {format.dateTime(new Date(selectedDay + 'T00:00:00'), {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h3>
                <IconButton
                  variant="ghost"
                  size="xs"
                  onClick={() => setSelectedDay(null)}
                  aria-label={t('closeDay')}
                >
                  <X size={14} aria-hidden />
                </IconButton>
              </div>
              {selectedDayTasks.length === 0 ? (
                <p className="text-sm text-muted">{t('dayEmpty')}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {selectedDayTasks.map((task) => {
                    const kind = kindOf(task)
                    const priority = priorityWord(task)
                    return (
                      <li key={task.id}>
                        <Link
                          href={`/task/${task.id}`}
                          className="group block rounded-[2px] no-underline text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                        >
                          <Strip kind={kind} quiet={isDone(task)}>
                            <span
                              className={cn(
                                'block text-sm leading-snug line-clamp-2 group-hover:underline',
                                isDone(task)
                                  ? 'text-muted line-through'
                                  : isPressing(task)
                                    ? 'font-semibold'
                                    : 'font-medium',
                              )}
                            >
                              {task.title}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-1 text-mid text-muted">
                              <span>{columnLabel(task.status)}</span>
                              {priority && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  {priority}
                                </>
                              )}
                              {task.assigned_to && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span
                                    className={
                                      kind === 'person' ? 'text-person-ink' : 'text-agent-ink'
                                    }
                                  >
                                    {agentName(task.assigned_to)}
                                  </span>
                                </>
                              )}
                            </span>
                          </Strip>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">{t('pickDay')}</p>
          )}
        </section>
      </div>
    </div>
  )
}
