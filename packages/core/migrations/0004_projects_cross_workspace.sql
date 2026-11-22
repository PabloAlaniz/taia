-- Projects cut across workspaces: a workspace is how the work flows (its
-- columns), a project is who or what the work is for. A project's tasks can
-- live in any workspace, so the project no longer belongs to one.
--
-- workspace_id stays as an optional "home" workspace (kept for API
-- compatibility). Deleting that workspace no longer deletes the project,
-- which may still have tasks elsewhere.
ALTER TABLE projects ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE projects ALTER COLUMN workspace_id DROP DEFAULT;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_workspace_id_fkey;
ALTER TABLE projects
  ADD CONSTRAINT projects_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
