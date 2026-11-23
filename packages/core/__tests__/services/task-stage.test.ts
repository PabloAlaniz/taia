import { describe, it, expect } from 'vitest'
import {
  columnStages,
  countStages,
  stagesByWorkspace,
  statusStage,
  taskStage,
} from '../../src/services/task-stage'

const col = (
  slug: string,
  position: number,
  flags: { done?: boolean; initial?: boolean } = {},
) => ({
  slug,
  position,
  is_done_state: flags.done ?? false,
  is_initial_state: flags.initial ?? false,
})

const stagesOf = (columns: ReturnType<typeof col>[]) => Object.fromEntries(columnStages(columns))

describe('columnStages', () => {
  it('reads the software preset', () => {
    expect(
      stagesOf([
        col('IDEA', 0),
        col('BACKLOG', 1, { initial: true }),
        col('ASSIGNED', 2),
        col('IN_PROGRESS', 3),
        col('REVIEW', 4),
        col('DONE', 5, { done: true }),
        col('REJECTED', 6, { done: true }),
      ]),
    ).toEqual({
      IDEA: 'todo',
      BACKLOG: 'todo',
      ASSIGNED: 'todo',
      IN_PROGRESS: 'in_progress',
      REVIEW: 'review',
      DONE: 'done',
      REJECTED: 'done',
    })
  })

  it('reads a board whose assigned column is called TODO', () => {
    expect(
      stagesOf([
        col('INBOX', 0, { initial: true }),
        col('TODO', 1),
        col('IN_PROGRESS', 2),
        col('REVIEW', 3),
        col('DONE', 4, { done: true }),
      ]),
    ).toEqual({
      INBOX: 'todo',
      TODO: 'todo',
      IN_PROGRESS: 'in_progress',
      REVIEW: 'review',
      DONE: 'done',
    })
  })

  it('reads the content presets by name and position', () => {
    expect(
      stagesOf([
        col('IDEAS', 0, { initial: true }),
        col('PLANIFICADO', 1),
        col('EN_PRODUCCION', 2),
        col('EN_REVISION', 3),
        col('PUBLICADO', 4, { done: true }),
        col('ARCHIVADO', 5, { done: true }),
      ]),
    ).toEqual({
      IDEAS: 'todo',
      PLANIFICADO: 'todo',
      EN_PRODUCCION: 'in_progress',
      EN_REVISION: 'review',
      PUBLICADO: 'done',
      ARCHIVADO: 'done',
    })
    expect(
      stagesOf([
        col('IDEAS', 0, { initial: true }),
        col('INVESTIGACION', 1),
        col('BORRADOR', 2),
        col('REVISION_FINAL', 3),
        col('PUBLICADO', 4, { done: true }),
      ]),
    ).toMatchObject({
      INVESTIGACION: 'in_progress',
      BORRADOR: 'in_progress',
      REVISION_FINAL: 'review',
    })
  })

  it('a custom column past the start is work in progress', () => {
    expect(
      stagesOf([
        col('LEAD', 0, { initial: true }),
        col('CONTACTADO', 1),
        col('NEGOCIACION', 2),
        col('CERRADO_GANADO', 3, { done: true }),
      ]),
    ).toEqual({
      LEAD: 'todo',
      CONTACTADO: 'in_progress',
      NEGOCIACION: 'in_progress',
      CERRADO_GANADO: 'done',
    })
  })

  it('without an initial column, the first one is the start', () => {
    expect(stagesOf([col('NUEVO', 1), col('HACIENDO', 2)])).toEqual({
      NUEVO: 'todo',
      HACIENDO: 'in_progress',
    })
  })

  it('orders by position, not by the order given', () => {
    expect(stagesOf([col('HACIENDO', 2), col('ENTRADA', 0, { initial: true })])).toEqual({
      ENTRADA: 'todo',
      HACIENDO: 'in_progress',
    })
  })
})

describe('taskStage', () => {
  const stages = stagesByWorkspace([
    { workspace_id: 'ws', ...col('INBOX', 0, { initial: true }) },
    { workspace_id: 'ws', ...col('TODO', 1) },
    { workspace_id: 'ws', ...col('IN_PROGRESS', 2) },
    { workspace_id: 'ws', ...col('PUBLICADO', 3, { done: true }) },
  ])

  it('reads the column of the task in its workspace', () => {
    expect(taskStage({ status: 'TODO', workspace_id: 'ws' }, stages)).toBe('todo')
    expect(taskStage({ status: 'PUBLICADO', workspace_id: 'ws' }, stages)).toBe('done')
  })

  it('falls back to the status name when there is no column', () => {
    expect(taskStage({ status: 'REVIEW', workspace_id: 'ws' }, stages)).toBe('review')
    expect(taskStage({ status: 'ASSIGNED', workspace_id: 'gone' }, stages)).toBe('todo')
    expect(taskStage({ status: 'DONE' }, stages)).toBe('done')
    expect(taskStage({ status: 'PUBLICADO', workspace_id: 'gone' }, stages)).toBe('in_progress')
  })

  it('counts each stage', () => {
    expect(
      countStages(
        [
          { status: 'INBOX', workspace_id: 'ws' },
          { status: 'TODO', workspace_id: 'ws' },
          { status: 'IN_PROGRESS', workspace_id: 'ws' },
          { status: 'PUBLICADO', workspace_id: 'ws' },
        ],
        stages,
      ),
    ).toEqual({ todo: 2, in_progress: 1, review: 0, done: 1 })
  })
})

describe('statusStage', () => {
  it('reads the legacy statuses', () => {
    expect(statusStage('INBOX')).toBe('todo')
    expect(statusStage('ASSIGNED')).toBe('todo')
    expect(statusStage('IN_PROGRESS')).toBe('in_progress')
    expect(statusStage('REVIEW')).toBe('review')
    expect(statusStage('DONE')).toBe('done')
    expect(statusStage('REJECTED')).toBe('done')
  })
})
