import type { Task } from '@taia/types'
import { getColumnStates } from '../db'

/** Per workspace: the column slugs it has, and which of them are done states. */
export type ColumnStates = Map<string, { known: Set<string>; done: Set<string> }>

export async function loadColumnStates(workspaceId?: string): Promise<ColumnStates> {
  const rows = await getColumnStates(workspaceId)
  const states: ColumnStates = new Map()
  for (const row of rows) {
    const ws = states.get(row.workspace_id) ?? { known: new Set(), done: new Set() }
    ws.known.add(row.slug)
    if (row.is_done_state) ws.done.add(row.slug)
    states.set(row.workspace_id, ws)
  }
  return states
}

/**
 * Finished means the task sits in one of its workspace's done columns
 * (DONE, PUBLICADO, CERRADO_GANADO…). A status with no column falls back
 * to the legacy DONE / REJECTED rule.
 */
export function isFinished(task: Pick<Task, 'status' | 'workspace_id'>, states: ColumnStates) {
  const ws = task.workspace_id ? states.get(task.workspace_id) : undefined
  if (ws?.known.has(task.status)) return ws.done.has(task.status)
  return task.status === 'DONE' || task.status === 'REJECTED'
}

/** Completed is finished, except rejected: that closed without being done. */
export function isCompleted(task: Pick<Task, 'status' | 'workspace_id'>, states: ColumnStates) {
  return task.status !== 'REJECTED' && isFinished(task, states)
}
