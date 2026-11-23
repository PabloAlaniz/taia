-- completed_at was only stamped when a task moved to the literal DONE or
-- REJECTED status. Tasks created straight into a finished column, or moved
-- into a finished column with another slug (PUBLICADO, CERRADO_GANADO…), were
-- left without it, so "completed today / this week" never counted them.
--
-- The repository now stamps it from the workspace's own columns
-- (is_done_state). For rows already sitting in a finished column with no
-- completed_at, the best record of when they finished is their last update.
-- The updated_at trigger is paused so the backfill does not rewrite it.
ALTER TABLE tasks DISABLE TRIGGER tasks_updated_at;

UPDATE tasks t
SET completed_at = COALESCE(t.updated_at, t.created_at, CURRENT_TIMESTAMP)
WHERE t.completed_at IS NULL
  AND COALESCE(
    (SELECT bc.is_done_state FROM board_columns bc
      WHERE bc.workspace_id = t.workspace_id AND bc.slug = t.status LIMIT 1),
    t.status IN ('DONE', 'REJECTED')
  );

ALTER TABLE tasks ENABLE TRIGGER tasks_updated_at;
