'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Task } from '@taia/types'
import { cn } from '../../lib/utils'
import { Button, IconButton } from '../atoms'

interface CalendarViewProps {
  tasks: Task[]
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getPriorityColor(task: Task): string {
  if (task.status === 'DONE') return 'bg-green-500'
  if (task.status === 'IN_PROGRESS') return 'bg-blue-500'
  if (task.priority === 'URGENT') return 'bg-red-500'
  if (task.priority === 'HIGH') return 'bg-orange-500'
  return 'bg-muted'
}

export function CalendarView({ tasks }: CalendarViewProps) {
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

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      currentWeek.push(null)
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day)
      if (currentWeek.length === 7) {
        weeks.push(currentWeek)
        currentWeek = []
      }
    }

    // Fill remaining cells in last week
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null)
      }
      weeks.push(currentWeek)
    }

    // Ensure 6 rows for consistent height
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

  const getDateKey = (day: number) => {
    const d = new Date(year, month, day)
    return formatDate(d)
  }

  const selectedDayTasks = selectedDay ? tasksByDate.get(selectedDay) || [] : []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <IconButton variant="ghost" size="sm" onClick={goToPrevMonth} aria-label="Previous month">
            ◀
          </IconButton>
          <h2 className="text-base font-bold min-w-[160px] text-center">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          <IconButton variant="ghost" size="sm" onClick={goToNextMonth} aria-label="Next month">
            ▶
          </IconButton>
        </div>
        <div className="flex items-center gap-3">
          {/* Legend - inline */}
          <div className="hidden md:flex items-center gap-3 text-xs text-muted">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span>Urgent</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span>High</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span>In Progress</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>Done</span>
            </div>
          </div>
          <Button variant="secondary" size="xs" onClick={goToToday}>
            Today
          </Button>
        </div>
      </div>

      <div className="flex flex-1 gap-3 min-h-0 overflow-hidden">
        {/* Calendar Grid */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Days of week header */}
          <div className="grid grid-cols-7 gap-1 shrink-0">
            {DAYS_OF_WEEK.map((day) => (
              <div key={day} className="text-center text-xs text-muted py-1 font-medium">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar weeks - grid with 6 equal rows */}
          <div className="flex-1 grid grid-rows-6 gap-1 min-h-0">
            {calendarWeeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-1 h-full">
                {week.map((day, dayIndex) => {
                  if (day === null) {
                    return (
                      <div
                        key={`empty-${weekIndex}-${dayIndex}`}
                        className="bg-background/50 rounded-sm h-full"
                      />
                    )
                  }

                  const dateKey = getDateKey(day)
                  const dayTasks = tasksByDate.get(dateKey) || []
                  const isSelected = selectedDay === dateKey

                  return (
                    <Button
                      key={day}
                      variant="ghost"
                      onClick={() => setSelectedDay(isSelected ? null : dateKey)}
                      className={cn(
                        'p-1 rounded-sm border transition-colors relative flex flex-col h-full font-normal',
                        'hover:bg-card focus:outline-hidden focus:ring-2 focus:ring-accent',
                        isToday(day) ? 'border-accent bg-accent/10' : 'border-border bg-background',
                        isSelected && 'ring-2 ring-accent',
                      )}
                    >
                      <div
                        className={cn(
                          'text-xs leading-none',
                          isToday(day) ? 'font-bold text-accent' : 'text-foreground',
                        )}
                      >
                        {day}
                      </div>

                      {/* Task badges */}
                      {dayTasks.length > 0 && (
                        <div className="flex-1 flex items-end justify-center pb-0.5">
                          <div className="flex gap-0.5 flex-wrap justify-center">
                            {dayTasks.length <= 3 ? (
                              dayTasks.map((task) => (
                                <div
                                  key={task.id}
                                  className={cn('w-1.5 h-1.5 rounded-full', getPriorityColor(task))}
                                  title={task.title}
                                />
                              ))
                            ) : (
                              <div className="text-2xs font-medium text-muted leading-none">
                                {dayTasks.length}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Selected Day Panel */}
        <div
          className={cn(
            'w-64 shrink-0 h-full bg-card border border-border rounded-lg p-3 flex flex-col overflow-hidden transition-all',
            !selectedDay && 'hidden md:flex',
          )}
        >
          {selectedDay ? (
            <>
              <div className="flex items-center justify-between mb-2 shrink-0">
                <h3 className="font-medium text-sm">
                  {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </h3>
                <IconButton
                  variant="ghost"
                  size="xs"
                  onClick={() => setSelectedDay(null)}
                  aria-label="Close day detail"
                >
                  ✕
                </IconButton>
              </div>
              {selectedDayTasks.length === 0 ? (
                <p className="text-xs text-muted">No tasks due this day</p>
              ) : (
                <div className="space-y-1.5 overflow-y-auto flex-1">
                  {selectedDayTasks.map((task) => (
                    <Link
                      key={task.id}
                      href={`/task/${task.id}`}
                      className="block p-2 bg-background rounded-sm border border-border hover:border-accent transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full mt-1 shrink-0',
                            getPriorityColor(task),
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{task.title}</div>
                          <div className="text-2xs text-muted flex items-center gap-1">
                            <span>{task.status}</span>
                            {task.assigned_to && <span>· {task.assigned_to}</span>}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-muted text-center flex-1 flex items-center justify-center">
              Click on a day to see tasks
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
