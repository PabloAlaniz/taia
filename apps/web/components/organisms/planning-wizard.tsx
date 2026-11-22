'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Button, Input, Select, Textarea, Label } from '../atoms'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../molecules/modal'

interface PlannedTask {
  title: string
  description: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  tags?: string[]
  estimated_minutes?: number
  selected: boolean
}

interface PlanningWizardProps {
  open: boolean
  onClose: () => void
  onCreateTasks: (
    tasks: Array<{
      title: string
      description?: string
      priority?: string
      tags?: string[]
      estimated_minutes?: number
    }>,
  ) => void
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'text-red-500',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-yellow-500',
  LOW: 'text-green-500',
}

export function PlanningWizard({ open, onClose, onCreateTasks }: PlanningWizardProps) {
  const t = useTranslations('planWizard')
  const tCommon = useTranslations('common')
  const [step, setStep] = useState<'input' | 'loading' | 'review'>('input')
  const [goal, setGoal] = useState('')
  const [context, setContext] = useState('')
  const [tasks, setTasks] = useState<PlannedTask[]>([])
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const reset = () => {
    setStep('input')
    setGoal('')
    setContext('')
    setTasks([])
    setError(null)
    setCreating(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleGenerate = async () => {
    if (!goal.trim()) return
    setStep('loading')
    setError(null)

    try {
      const res = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: goal.trim(), context: context.trim() || undefined }),
      })

      const data = await res.json()

      if (!data.ok) {
        throw new Error(data.error || 'Failed to generate plan')
      }

      const planned = data.plan.tasks.map((t: Record<string, unknown>) => ({
        ...t,
        selected: true,
      }))
      setTasks(planned)
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStep('input')
    }
  }

  const handleToggleTask = (index: number) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, selected: !t.selected } : t)))
  }

  const handleRemoveTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpdateTitle = (index: number, title: string) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, title } : t)))
  }

  const handleUpdatePriority = (index: number, priority: PlannedTask['priority']) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, priority } : t)))
  }

  const handleCreateAll = async () => {
    const selected = tasks.filter((t) => t.selected)
    if (selected.length === 0) return

    setCreating(true)
    try {
      onCreateTasks(selected.map(({ selected: _, ...t }) => t))
      handleClose()
    } catch {
      setCreating(false)
    }
  }

  const selectedCount = tasks.filter((t) => t.selected).length

  return (
    <Modal open={open} onClose={handleClose} size="lg" aria-labelledby="planning-wizard-title">
      <ModalHeader>
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">
            🧙
          </span>
          <h2 id="planning-wizard-title" className="text-lg font-semibold">
            {t('title')}
          </h2>
        </div>
        {step === 'review' && <p className="text-xs text-muted mt-1">{t('subtitle')}</p>}
      </ModalHeader>

      <ModalBody>
        {step === 'input' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="goal">{t('goalLabel')}</Label>
              <Textarea
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t('goalPlaceholder')}
                className="mt-1 min-h-[80px]"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="context">{t('contextLabel')}</Label>
              <Textarea
                id="context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder={t('contextPlaceholder')}
                className="mt-1 min-h-[60px]"
              />
            </div>
            {error && <Alert variant="error">{error}</Alert>}
          </div>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="animate-spin text-3xl">🧠</div>
            <p className="text-sm text-muted">{t('generating')}</p>
            <p className="text-xs text-muted">{t('generatingHelp')}</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">
                {t('selected', { selected: selectedCount, total: tasks.length })}
              </span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  const allSelected = tasks.every((t) => t.selected)
                  setTasks((prev) => prev.map((t) => ({ ...t, selected: !allSelected })))
                }}
              >
                {tasks.every((t) => t.selected) ? t('deselectAll') : t('selectAll')}
              </Button>
            </div>

            {tasks.map((task, i) => (
              <div
                key={i}
                className={`border rounded-lg p-3 transition-colors ${
                  task.selected
                    ? 'border-accent/50 bg-accent/5'
                    : 'border-border bg-background opacity-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <Input
                    type="checkbox"
                    checked={task.selected}
                    onChange={() => handleToggleTask(i)}
                    className="mt-1.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <Input
                      type="text"
                      value={task.title}
                      onChange={(e) => handleUpdateTitle(i, e.target.value)}
                      className="w-full bg-transparent font-medium text-sm border-none outline-hidden"
                    />
                    <p className="text-xs text-muted mt-1 line-clamp-2">{task.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Select
                        value={task.priority}
                        onChange={(e) =>
                          handleUpdatePriority(i, e.target.value as PlannedTask['priority'])
                        }
                        className="text-xs bg-background border border-border rounded-sm px-1.5 py-0.5"
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                        <option value="URGENT">URGENT</option>
                      </Select>
                      <span className={`text-xs ${PRIORITY_COLORS[task.priority]}`}>
                        {task.priority}
                      </span>
                      {task.tags && task.tags.length > 0 && (
                        <div className="flex gap-1">
                          {task.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-accent/10 text-accent rounded-sm px-1.5 py-0.5"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {task.estimated_minutes && (
                        <span className="text-xs text-muted ml-auto">
                          ~{task.estimated_minutes}m
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleRemoveTask(i)}
                        className="text-xs text-muted hover:text-red-500 ml-auto"
                        title={t('removeTask')}
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {step === 'input' && (
          <>
            <Button variant="secondary" size="sm" onClick={handleClose}>
              {tCommon('cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={handleGenerate} disabled={!goal.trim()}>
              {t('generatePlan')}
            </Button>
          </>
        )}
        {step === 'loading' && (
          <Button variant="secondary" size="sm" onClick={handleClose}>
            {tCommon('cancel')}
          </Button>
        )}
        {step === 'review' && (
          <>
            <Button variant="secondary" size="sm" onClick={() => setStep('input')}>
              {tCommon('back')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateAll}
              disabled={selectedCount === 0 || creating}
            >
              {creating ? t('creating') : t('createTasks', { count: selectedCount })}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  )
}
