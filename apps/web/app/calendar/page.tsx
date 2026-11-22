'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import { Task } from '@taia/types'
import { CalendarView } from '../../components/organisms/calendar-view'
import { Button } from '../../components/atoms'
import { PageHeader } from '@/components/molecules/page-header'
import { api } from '@/lib/api'

export default function CalendarPage() {
  const tp = useTranslations('pageTitles')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTasks()
  }, [])

  async function fetchTasks() {
    try {
      // Through the API client, so the calendar shows the active workspace only.
      const data = await api.tasks.list()
      setTasks(data.tasks || [])
    } catch (e) {
      console.error('Failed to fetch tasks:', e)
    } finally {
      setLoading(false)
    }
  }

  const tasksWithDueDate = tasks.filter((t) => t.due_date)

  if (loading) {
    return (
      <div className="h-[calc(100vh/1.1)] bg-background flex items-center justify-center">
        <span className="text-2xl">⏳</span>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh/1.1)] bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <PageHeader title={tp('calendar')} backHref="/" backLabel={tp('board')}>
        <span className="text-xs text-muted">{tasksWithDueDate.length} tasks with due dates</span>
        <Button variant="secondary" size="sm" onClick={fetchTasks}>
          🔄 Refresh
        </Button>
      </PageHeader>

      {/* Calendar Content - fills remaining space */}
      <div className="flex-1 p-4 overflow-hidden">
        <CalendarView tasks={tasks} />
      </div>
    </div>
  )
}
