'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { TaskPriority, TaskStatus, TaskTemplate, Project } from '@taia/types'
import { Button, Input, Textarea, Select, Label } from '../atoms'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../molecules/modal'
import { api } from '../../lib/api'
import { useStore } from '../../lib/store'

interface AddTaskModalProps {
  open: boolean
  onClose: () => void
  projects: Project[]
  onAdd: (task: {
    title: string
    description?: string
    project?: string
    project_id?: string
    repo_url?: string
    priority: TaskPriority
    status: TaskStatus
    tags?: string[]
  }) => void
}

export function AddTaskModal({ open, onClose, projects, onAdd }: AddTaskModalProps) {
  const t = useTranslations('addTask')
  const tc = useTranslations('common')
  const boardColumns = useStore((s) => s.boardColumns)
  const initialSlug = boardColumns.find((c) => c.is_initial_state)?.slug || 'INBOX'
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [tags, setTags] = useState('')
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  // Fetch templates when modal opens
  useEffect(() => {
    if (open && templates.length === 0) {
      api.templates
        .list()
        .then((data) => setTemplates(data.templates || []))
        .catch(() => {})
    }
  }, [open, templates.length])

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId)
    if (!templateId) return

    const template = templates.find((t) => t.id === templateId)
    if (!template) return

    // Apply template defaults (don't override title if user already typed)
    if (template.description) setDescription(template.description)
    if (template.default_priority) setPriority(template.default_priority)
    if (template.default_tags?.length) setTags(template.default_tags.join(', '))
    if (template.default_project) {
      const project = projects.find(
        (p) => p.name === template.default_project || p.id === template.default_project,
      )
      if (project) setProjectId(project.id)
    }
  }

  const selectedProject = projects.find((p) => p.id === projectId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onAdd({
      title: title.trim(),
      description: description.trim() || undefined,
      project: selectedProject?.name || undefined,
      project_id: projectId || undefined,
      repo_url: repoUrl.trim() || undefined,
      priority,
      status: initialSlug,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    })
    // Reset form
    setTitle('')
    setDescription('')
    setProjectId('')
    setRepoUrl('')
    setPriority('MEDIUM')
    setTags('')
    setSelectedTemplateId('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} size="md" aria-labelledby="add-task-title">
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <h2 id="add-task-title" className="text-lg font-semibold">
            {t('title')}
          </h2>
        </ModalHeader>

        <ModalBody className="flex flex-col gap-4">
          {/* Template Selector */}
          {templates.length > 0 && (
            <div>
              <Label htmlFor="task-template">{t('template')}</Label>
              <Select
                id="task-template"
                value={selectedTemplateId}
                onChange={(e) => handleTemplateSelect(e.target.value)}
              >
                <option value="">{t('blankTask')}</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="task-title" required>
              {t('taskTitle')}
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('taskTitlePlaceholder')}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="task-description">{t('description')}</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="task-project">{t('project')}</Label>
              <Select
                id="task-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">{t('noProject')}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="task-priority">{t('priority')}</Label>
              <Select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                <option value="LOW">{t('priorityLow')}</option>
                <option value="MEDIUM">{t('priorityMedium')}</option>
                <option value="HIGH">{t('priorityHigh')}</option>
                <option value="URGENT">{t('priorityUrgent')}</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="task-repo">{t('repoUrl')}</Label>
            <Input
              id="task-repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
            />
          </div>

          <div>
            <Label htmlFor="task-tags">{t('tags')}</Label>
            <Input
              id="task-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('tagsPlaceholder')}
            />
          </div>
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!title.trim()}>
            {tc('create')}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
