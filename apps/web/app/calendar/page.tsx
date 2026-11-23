'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Task } from '@taia/types'
import { CalendarView } from '../../components/organisms/calendar-view'
import { IconButton } from '../../components/atoms'
import { PageHeader } from '@/components/molecules/page-header'
import { api } from '@/lib/api'

export default function CalendarPage() {
  const tp = useTranslations('pageTitles')
  const t = useTranslations('calendarUi')
  const tc = useTranslations('common')
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

  return (
    <div className="min-h-full">
      <PageHeader title={tp('calendar')} width="data" backHref="/" backLabel={tp('board')}>
        {!loading && (
          <span className="text-mid text-muted tabular-nums">
            {t('dueCount', { count: tasksWithDueDate.length })}
          </span>
        )}
        <IconButton variant="secondary" size="sm" onClick={fetchTasks} aria-label={t('refresh')}>
          <RefreshCw size={15} aria-hidden />
        </IconButton>
      </PageHeader>

      <div className="px-4 md:px-6 pt-4 pb-10 max-w-6xl mx-auto">
        {loading ? (
          <p role="status" className="text-sm text-muted">
            {tc('loading')}
          </p>
        ) : (
          <CalendarView tasks={tasks} />
        )}
      </div>
    </div>
  )
}
