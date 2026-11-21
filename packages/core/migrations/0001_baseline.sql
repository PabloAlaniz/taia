-- TAIA database schema — baseline for the first public release.
--
-- Generated from the final schema of the pre-release migrations with
-- `pg_dump --schema-only` and cleaned up (no legacy tables, columns, data
-- backfills or settings seeds). New schema changes go in new numbered files
-- next to this one (0002_<name>.sql, ...); never edit an applied migration.

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TABLE public.activities (
    id text NOT NULL,
    type text NOT NULL,
    agent_id text DEFAULT 'unknown'::text NOT NULL,
    task_id text,
    message text NOT NULL,
    metadata jsonb,
    workspace_id text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.agent_context (
    agent_id text NOT NULL,
    agent_identity_version_id text,
    project_context_version_id text,
    user_profile_version_id text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.agent_context_sync (
    agent_id text NOT NULL,
    provider text NOT NULL,
    mode text NOT NULL,
    status text NOT NULL,
    fingerprint text DEFAULT ''::text NOT NULL,
    remote_hashes jsonb DEFAULT '{}'::jsonb NOT NULL,
    conflicts jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_error text,
    synced_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_context_sync_mode_check CHECK ((mode = ANY (ARRAY['push'::text, 'pull'::text])))
);

CREATE TABLE public.agent_identity_versions (
    id text NOT NULL,
    agent_id text NOT NULL,
    content jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    note text
);

CREATE TABLE public.agent_memory (
    id text NOT NULL,
    agent_id text NOT NULL,
    path text NOT NULL,
    content text NOT NULL,
    content_sha256 text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agent_runtime_settings (
    agent_id text NOT NULL,
    model jsonb,
    denied_tools jsonb,
    workspace text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    runtime_instance_id text
);

CREATE TABLE public.agent_working_state (
    agent_id text NOT NULL,
    task_id text,
    content text DEFAULT ''::text NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.agents (
    id text NOT NULL,
    name text NOT NULL,
    role text,
    avatar text,
    enabled boolean DEFAULT true,
    type text DEFAULT 'cron'::text,
    config jsonb,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    project_id text,
    CONSTRAINT agents_type_check CHECK ((type = ANY (ARRAY['cron'::text, 'api'::text, 'human'::text, 'orchestrator'::text])))
);

CREATE TABLE public.approval_requests (
    id text NOT NULL,
    session_key text NOT NULL,
    agent_id text NOT NULL,
    tool_name text NOT NULL,
    tool_use_id text NOT NULL,
    tool_input jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    decision_reason text,
    decided_at timestamp with time zone,
    decided_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT approval_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'timed_out'::text])))
);

CREATE TABLE public.board_columns (
    id text NOT NULL,
    workspace_id text DEFAULT 'ws-default'::text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    icon text,
    "position" integer NOT NULL,
    color text,
    is_done_state boolean DEFAULT false,
    is_initial_state boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.column_settings (
    id text NOT NULL,
    column_name text NOT NULL,
    wip_limit integer,
    workspace_id text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.message_mentions (
    message_id text NOT NULL,
    agent_id text NOT NULL
);

CREATE TABLE public.messages (
    id text NOT NULL,
    task_id text NOT NULL,
    from_agent_id text NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.notifications (
    id text NOT NULL,
    idempotency_key text NOT NULL,
    mentioned_agent_id text NOT NULL,
    from_agent_id text,
    task_id text,
    source_message_id text,
    content text NOT NULL,
    status text DEFAULT 'pending'::text,
    attempts integer DEFAULT 0,
    last_attempt_at timestamp without time zone,
    next_retry_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'delivered'::text, 'failed'::text])))
);

CREATE TABLE public.project_context_versions (
    id text NOT NULL,
    project_id text NOT NULL,
    content jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    note text
);

CREATE TABLE public.projects (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    workspace_id text DEFAULT 'ws-default'::text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    glossary jsonb,
    knowledge_refs jsonb
);

CREATE TABLE public.repositories (
    id text NOT NULL,
    project_id text NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    is_primary boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.runtime_instances (
    id text NOT NULL,
    provider text NOT NULL,
    label text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT runtime_instances_id_check CHECK ((id ~ '^[a-z0-9][a-z0-9_-]{0,62}$'::text))
);

CREATE TABLE public.runtime_messages (
    id text NOT NULL,
    session_key text NOT NULL,
    role text NOT NULL,
    content jsonb NOT NULL,
    model text,
    stop_reason text,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT runtime_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text])))
);

CREATE TABLE public.runtime_sessions (
    session_key text NOT NULL,
    agent_id text NOT NULL,
    provider text NOT NULL,
    run_id text NOT NULL,
    model text,
    status text DEFAULT 'running'::text NOT NULL,
    stop_reason text,
    label text,
    total_tokens integer DEFAULT 0 NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cache_creation_input_tokens integer DEFAULT 0 NOT NULL,
    cache_read_input_tokens integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    duration_ms integer,
    bundle_version_ids jsonb,
    instance_id text,
    CONSTRAINT runtime_sessions_status_check CHECK ((status = ANY (ARRAY['running'::text, 'idle'::text, 'failed'::text])))
);

CREATE TABLE public.saved_filters (
    id text NOT NULL,
    name text NOT NULL,
    icon text,
    filter_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_predefined boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    workspace_id text DEFAULT 'ws-default'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.session_costs (
    id text NOT NULL,
    session_key text NOT NULL,
    agent_id text NOT NULL,
    task_id text,
    model text DEFAULT 'unknown'::text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    estimated_cost_usd numeric(10,6) DEFAULT 0 NOT NULL,
    session_updated_at bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cache_creation_input_tokens integer DEFAULT 0 NOT NULL,
    cache_read_input_tokens integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.settings_audit_events (
    id text NOT NULL,
    workspace_id text NOT NULL,
    setting_key text NOT NULL,
    resource_type text NOT NULL,
    operation text NOT NULL,
    actor text DEFAULT 'unknown'::text NOT NULL,
    origin text DEFAULT 'unknown'::text NOT NULL,
    result text NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT settings_audit_events_operation_check CHECK ((operation = ANY (ARRAY['create'::text, 'update'::text, 'revoke'::text]))),
    CONSTRAINT settings_audit_events_resource_type_check CHECK ((resource_type = ANY (ARRAY['setting'::text, 'api_key'::text]))),
    CONSTRAINT settings_audit_events_result_check CHECK ((result = ANY (ARRAY['success'::text, 'skipped'::text, 'failure'::text])))
);

CREATE TABLE public.subtasks (
    id text NOT NULL,
    task_id text NOT NULL,
    title text NOT NULL,
    completed boolean DEFAULT false,
    "position" integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.tag_colors (
    tag text NOT NULL,
    color text DEFAULT '#6B7280'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id text
);

CREATE TABLE public.task_dependencies (
    id text NOT NULL,
    task_id text NOT NULL,
    depends_on_task_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_no_self_dependency CHECK ((task_id <> depends_on_task_id))
);

CREATE TABLE public.task_tags (
    task_id text NOT NULL,
    tag text NOT NULL
);

CREATE TABLE public.task_templates (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    default_status text DEFAULT 'INBOX'::text NOT NULL,
    default_priority text DEFAULT 'MEDIUM'::text NOT NULL,
    default_project text,
    default_assigned_to text,
    default_tags text[] DEFAULT ARRAY[]::text[],
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id text
);

CREATE TABLE public.task_trajectories (
    id text NOT NULL,
    workspace_id text NOT NULL,
    task_id text NOT NULL,
    actor text DEFAULT 'unknown'::text NOT NULL,
    decision text NOT NULL,
    reasoning text,
    outcome text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tasks (
    id text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'INBOX'::text,
    priority text DEFAULT 'MEDIUM'::text,
    confidence text DEFAULT 'needs-approval'::text,
    assigned_to text,
    created_by text DEFAULT 'unknown'::text NOT NULL,
    project text,
    project_id text,
    repo_url text,
    session_key text,
    workspace_id text DEFAULT 'ws-default'::text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    time_spent_minutes integer DEFAULT 0,
    due_date timestamp without time zone,
    estimated_minutes integer,
    CONSTRAINT tasks_confidence_check CHECK ((confidence = ANY (ARRAY['auto-merge'::text, 'notify-only'::text, 'needs-approval'::text]))),
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'URGENT'::text])))
);

CREATE TABLE public.user_profile_versions (
    id text NOT NULL,
    user_id text NOT NULL,
    content jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    note text
);

CREATE TABLE public.workspace_agents (
    workspace_id text NOT NULL,
    agent_id text NOT NULL,
    added_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.workspace_presets (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    columns jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.workspaces (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    icon text DEFAULT '📋'::text,
    color text DEFAULT '#3b82f6'::text,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.worktrees (
    id text NOT NULL,
    task_id text NOT NULL,
    repository_id text NOT NULL,
    branch_name text NOT NULL,
    base_branch text DEFAULT 'main'::text NOT NULL,
    worktree_path text,
    status text DEFAULT 'creating'::text NOT NULL,
    created_by text,
    merge_strategy text DEFAULT 'squash'::text,
    diff_stats jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT worktrees_merge_strategy_check CHECK ((merge_strategy = ANY (ARRAY['merge'::text, 'squash'::text, 'rebase'::text]))),
    CONSTRAINT worktrees_status_check CHECK ((status = ANY (ARRAY['creating'::text, 'active'::text, 'reviewing'::text, 'merging'::text, 'merged'::text, 'failed'::text, 'cleanup'::text])))
);

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.agent_context
    ADD CONSTRAINT agent_context_pkey PRIMARY KEY (agent_id);

ALTER TABLE ONLY public.agent_context_sync
    ADD CONSTRAINT agent_context_sync_pkey PRIMARY KEY (agent_id, provider);

ALTER TABLE ONLY public.agent_identity_versions
    ADD CONSTRAINT agent_identity_versions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_agent_id_path_key UNIQUE (agent_id, path);

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.agent_runtime_settings
    ADD CONSTRAINT agent_runtime_settings_pkey PRIMARY KEY (agent_id);

ALTER TABLE ONLY public.agent_working_state
    ADD CONSTRAINT agent_working_state_pkey PRIMARY KEY (agent_id);

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT board_columns_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT board_columns_workspace_id_slug_key UNIQUE (workspace_id, slug);

ALTER TABLE ONLY public.column_settings
    ADD CONSTRAINT column_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.message_mentions
    ADD CONSTRAINT message_mentions_pkey PRIMARY KEY (message_id, agent_id);

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_idempotency_key_key UNIQUE (idempotency_key);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.project_context_versions
    ADD CONSTRAINT project_context_versions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_name_key UNIQUE (name);

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT repositories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.runtime_instances
    ADD CONSTRAINT runtime_instances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.runtime_messages
    ADD CONSTRAINT runtime_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.runtime_sessions
    ADD CONSTRAINT runtime_sessions_pkey PRIMARY KEY (session_key);

ALTER TABLE ONLY public.saved_filters
    ADD CONSTRAINT saved_filters_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.session_costs
    ADD CONSTRAINT session_costs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.session_costs
    ADD CONSTRAINT session_costs_session_key_key UNIQUE (session_key);

ALTER TABLE ONLY public.settings_audit_events
    ADD CONSTRAINT settings_audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tag_colors
    ADD CONSTRAINT tag_colors_pkey PRIMARY KEY (tag);

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_task_id_tag_key UNIQUE (task_id, tag);

ALTER TABLE ONLY public.task_templates
    ADD CONSTRAINT task_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_trajectories
    ADD CONSTRAINT task_trajectories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_profile_versions
    ADD CONSTRAINT user_profile_versions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workspace_agents
    ADD CONSTRAINT workspace_agents_pkey PRIMARY KEY (workspace_id, agent_id);

ALTER TABLE ONLY public.workspace_presets
    ADD CONSTRAINT workspace_presets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.worktrees
    ADD CONSTRAINT worktrees_pkey PRIMARY KEY (id);

CREATE INDEX idx_activities_created ON public.activities USING btree (created_at DESC);

CREATE INDEX idx_activities_workspace_created ON public.activities USING btree (workspace_id, created_at DESC);

CREATE INDEX idx_agent_identity_versions_agent ON public.agent_identity_versions USING btree (agent_id, created_at DESC);

CREATE INDEX idx_agent_memory_agent ON public.agent_memory USING btree (agent_id);

CREATE INDEX idx_agent_memory_agent_path ON public.agent_memory USING btree (agent_id, path);

CREATE INDEX idx_agents_enabled ON public.agents USING btree (enabled);

CREATE INDEX idx_agents_project ON public.agents USING btree (project_id);

CREATE INDEX idx_agents_sort ON public.agents USING btree (sort_order);

CREATE INDEX idx_approval_requests_agent_status ON public.approval_requests USING btree (agent_id, status, created_at DESC);

CREATE INDEX idx_approval_requests_session ON public.approval_requests USING btree (session_key);

CREATE UNIQUE INDEX idx_approval_requests_tool_use ON public.approval_requests USING btree (session_key, tool_use_id);

CREATE INDEX idx_board_columns_workspace ON public.board_columns USING btree (workspace_id);

CREATE INDEX idx_mentions_agent ON public.message_mentions USING btree (agent_id);

CREATE INDEX idx_messages_task ON public.messages USING btree (task_id);

CREATE INDEX idx_notifications_agent ON public.notifications USING btree (mentioned_agent_id);

CREATE INDEX idx_notifications_pending ON public.notifications USING btree (status, next_retry_at);

CREATE INDEX idx_notifications_task_status_created ON public.notifications USING btree (task_id, status, created_at DESC);

CREATE INDEX idx_project_context_versions_project ON public.project_context_versions USING btree (project_id, created_at DESC);

CREATE INDEX idx_projects_workspace ON public.projects USING btree (workspace_id);

CREATE UNIQUE INDEX idx_repositories_primary ON public.repositories USING btree (project_id) WHERE (is_primary = true);

CREATE INDEX idx_repositories_project ON public.repositories USING btree (project_id);

CREATE INDEX idx_runtime_messages_session ON public.runtime_messages USING btree (session_key, "position");

CREATE INDEX idx_runtime_sessions_agent ON public.runtime_sessions USING btree (agent_id);

CREATE INDEX idx_runtime_sessions_duration ON public.runtime_sessions USING btree (duration_ms) WHERE (duration_ms IS NOT NULL);

CREATE INDEX idx_runtime_sessions_instance ON public.runtime_sessions USING btree (instance_id);

CREATE INDEX idx_runtime_sessions_provider ON public.runtime_sessions USING btree (provider);

CREATE INDEX idx_runtime_sessions_updated_at ON public.runtime_sessions USING btree (updated_at DESC);

CREATE INDEX idx_saved_filters_sort ON public.saved_filters USING btree (sort_order);

CREATE INDEX idx_session_costs_agent_id ON public.session_costs USING btree (agent_id);

CREATE INDEX idx_session_costs_created_at ON public.session_costs USING btree (created_at);

CREATE INDEX idx_session_costs_task_id ON public.session_costs USING btree (task_id);

CREATE INDEX idx_settings_audit_workspace_created ON public.settings_audit_events USING btree (workspace_id, created_at DESC);

CREATE INDEX idx_settings_audit_workspace_key ON public.settings_audit_events USING btree (workspace_id, setting_key, created_at DESC);

CREATE INDEX idx_subtasks_task ON public.subtasks USING btree (task_id);

CREATE INDEX idx_task_deps_depends_on ON public.task_dependencies USING btree (depends_on_task_id);

CREATE INDEX idx_task_deps_task ON public.task_dependencies USING btree (task_id);

CREATE UNIQUE INDEX idx_task_deps_unique ON public.task_dependencies USING btree (task_id, depends_on_task_id);

CREATE INDEX idx_task_tags_tag ON public.task_tags USING btree (tag);

CREATE INDEX idx_task_trajectories_workspace_created ON public.task_trajectories USING btree (workspace_id, created_at DESC);

CREATE INDEX idx_task_trajectories_workspace_task_created ON public.task_trajectories USING btree (workspace_id, task_id, created_at, id);

CREATE INDEX idx_tasks_assigned ON public.tasks USING btree (assigned_to);

CREATE INDEX idx_tasks_created_by ON public.tasks USING btree (created_by);

CREATE INDEX idx_tasks_project ON public.tasks USING btree (project_id);

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);

CREATE INDEX idx_tasks_workspace ON public.tasks USING btree (workspace_id);

CREATE INDEX idx_user_profile_versions_user ON public.user_profile_versions USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX idx_worktrees_active_task ON public.worktrees USING btree (task_id, repository_id) WHERE (status <> ALL (ARRAY['merged'::text, 'failed'::text, 'cleanup'::text]));

CREATE INDEX idx_worktrees_status ON public.worktrees USING btree (status);

CREATE INDEX idx_worktrees_task ON public.worktrees USING btree (task_id);

CREATE TRIGGER agent_context_updated_at BEFORE UPDATE ON public.agent_context FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER board_columns_updated_at BEFORE UPDATE ON public.board_columns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER column_settings_updated_at BEFORE UPDATE ON public.column_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER task_templates_updated_at BEFORE UPDATE ON public.task_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_session_costs_updated_at BEFORE UPDATE ON public.session_costs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.agent_context
    ADD CONSTRAINT agent_context_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.agent_context
    ADD CONSTRAINT agent_context_agent_identity_version_id_fkey FOREIGN KEY (agent_identity_version_id) REFERENCES public.agent_identity_versions(id);

ALTER TABLE ONLY public.agent_context
    ADD CONSTRAINT agent_context_project_context_version_id_fkey FOREIGN KEY (project_context_version_id) REFERENCES public.project_context_versions(id);

ALTER TABLE ONLY public.agent_context_sync
    ADD CONSTRAINT agent_context_sync_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.agent_context
    ADD CONSTRAINT agent_context_user_profile_version_id_fkey FOREIGN KEY (user_profile_version_id) REFERENCES public.user_profile_versions(id);

ALTER TABLE ONLY public.agent_identity_versions
    ADD CONSTRAINT agent_identity_versions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.agent_runtime_settings
    ADD CONSTRAINT agent_runtime_settings_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.agent_runtime_settings
    ADD CONSTRAINT agent_runtime_settings_runtime_instance_id_fkey FOREIGN KEY (runtime_instance_id) REFERENCES public.runtime_instances(id);

ALTER TABLE ONLY public.agent_working_state
    ADD CONSTRAINT agent_working_state_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.agent_working_state
    ADD CONSTRAINT agent_working_state_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT board_columns_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.column_settings
    ADD CONSTRAINT column_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.message_mentions
    ADD CONSTRAINT message_mentions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_context_versions
    ADD CONSTRAINT project_context_versions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT repositories_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.runtime_messages
    ADD CONSTRAINT runtime_messages_session_key_fkey FOREIGN KEY (session_key) REFERENCES public.runtime_sessions(session_key) ON DELETE CASCADE;

ALTER TABLE ONLY public.runtime_sessions
    ADD CONSTRAINT runtime_sessions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.runtime_sessions
    ADD CONSTRAINT runtime_sessions_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.runtime_instances(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.saved_filters
    ADD CONSTRAINT saved_filters_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tag_colors
    ADD CONSTRAINT tag_colors_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_depends_on_task_id_fkey FOREIGN KEY (depends_on_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_templates
    ADD CONSTRAINT task_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_trajectories
    ADD CONSTRAINT task_trajectories_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workspace_agents
    ADD CONSTRAINT workspace_agents_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workspace_agents
    ADD CONSTRAINT workspace_agents_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.worktrees
    ADD CONSTRAINT worktrees_repository_id_fkey FOREIGN KEY (repository_id) REFERENCES public.repositories(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.worktrees
    ADD CONSTRAINT worktrees_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

-- Seed data

-- Default workspace
INSERT INTO public.workspaces (id, name, slug, description, icon, color, is_default) VALUES ('ws-default', 'Default', 'default', NULL, '📋', '#3b82f6', true);

-- Board presets offered when creating a workspace
INSERT INTO public.workspace_presets (id, name, description, icon, columns) VALUES ('preset-software-dev', 'Software Dev', NULL, '💻', '[{"icon": "💡", "slug": "IDEA", "label": "Ideas", "is_done_state": false, "is_initial_state": false}, {"icon": "📥", "slug": "BACKLOG", "label": "Backlog", "is_done_state": false, "is_initial_state": true}, {"icon": "👤", "slug": "ASSIGNED", "label": "Assigned", "is_done_state": false, "is_initial_state": false}, {"icon": "🔨", "slug": "IN_PROGRESS", "label": "In Progress", "is_done_state": false, "is_initial_state": false}, {"icon": "👀", "slug": "REVIEW", "label": "Review", "is_done_state": false, "is_initial_state": false}, {"icon": "✅", "slug": "DONE", "label": "Done", "is_done_state": true, "is_initial_state": false}, {"icon": "🚫", "slug": "REJECTED", "label": "Rejected", "is_done_state": true, "is_initial_state": false}]'::jsonb);
INSERT INTO public.workspace_presets (id, name, description, icon, columns) VALUES ('preset-marketing', 'Marketing', NULL, '📢', '[{"icon": "💡", "slug": "IDEAS", "label": "Ideas", "is_done_state": false, "is_initial_state": true}, {"icon": "📋", "slug": "PLANIFICADO", "label": "Planificado", "is_done_state": false, "is_initial_state": false}, {"icon": "🎬", "slug": "EN_PRODUCCION", "label": "En Producción", "is_done_state": false, "is_initial_state": false}, {"icon": "👀", "slug": "EN_REVISION", "label": "En Revisión", "is_done_state": false, "is_initial_state": false}, {"icon": "🚀", "slug": "PUBLICADO", "label": "Publicado", "is_done_state": true, "is_initial_state": false}, {"icon": "📦", "slug": "ARCHIVADO", "label": "Archivado", "is_done_state": true, "is_initial_state": false}]'::jsonb);
INSERT INTO public.workspace_presets (id, name, description, icon, columns) VALUES ('preset-escritura', 'Escritura', NULL, '✍️', '[{"icon": "💡", "slug": "IDEAS", "label": "Ideas", "is_done_state": false, "is_initial_state": true}, {"icon": "🔍", "slug": "INVESTIGACION", "label": "Investigación", "is_done_state": false, "is_initial_state": false}, {"icon": "📝", "slug": "BORRADOR", "label": "Borrador", "is_done_state": false, "is_initial_state": false}, {"icon": "✂️", "slug": "EDICION", "label": "Edición", "is_done_state": false, "is_initial_state": false}, {"icon": "👀", "slug": "REVISION_FINAL", "label": "Revisión Final", "is_done_state": false, "is_initial_state": false}, {"icon": "📖", "slug": "PUBLICADO", "label": "Publicado", "is_done_state": true, "is_initial_state": false}]'::jsonb);
INSERT INTO public.workspace_presets (id, name, description, icon, columns) VALUES ('preset-ventas', 'Ventas', NULL, '💰', '[{"icon": "🎯", "slug": "LEAD", "label": "Lead", "is_done_state": false, "is_initial_state": true}, {"icon": "📞", "slug": "CONTACTADO", "label": "Contactado", "is_done_state": false, "is_initial_state": false}, {"icon": "📄", "slug": "PROPUESTA", "label": "Propuesta", "is_done_state": false, "is_initial_state": false}, {"icon": "🤝", "slug": "NEGOCIACION", "label": "Negociación", "is_done_state": false, "is_initial_state": false}, {"icon": "🏆", "slug": "CERRADO_GANADO", "label": "Cerrado-Ganado", "is_done_state": true, "is_initial_state": false}, {"icon": "❌", "slug": "CERRADO_PERDIDO", "label": "Cerrado-Perdido", "is_done_state": true, "is_initial_state": false}]'::jsonb);
INSERT INTO public.workspace_presets (id, name, description, icon, columns) VALUES ('preset-personalizado', 'Personalizado', NULL, '⚙️', '[{"icon": "📋", "slug": "TODO", "label": "To Do", "is_done_state": false, "is_initial_state": true}, {"icon": "🔨", "slug": "IN_PROGRESS", "label": "In Progress", "is_done_state": false, "is_initial_state": false}, {"icon": "✅", "slug": "DONE", "label": "Done", "is_done_state": true, "is_initial_state": false}]'::jsonb);

-- Default tag colors
INSERT INTO public.tag_colors (tag, color, workspace_id) VALUES ('blocked', '#EF4444', 'ws-default');
INSERT INTO public.tag_colors (tag, color, workspace_id) VALUES ('needs-clarification', '#F59E0B', 'ws-default');
INSERT INTO public.tag_colors (tag, color, workspace_id) VALUES ('bug', '#EF4444', 'ws-default');
INSERT INTO public.tag_colors (tag, color, workspace_id) VALUES ('feature', '#3B82F6', 'ws-default');
INSERT INTO public.tag_colors (tag, color, workspace_id) VALUES ('frontend', '#8B5CF6', 'ws-default');
INSERT INTO public.tag_colors (tag, color, workspace_id) VALUES ('backend', '#10B981', 'ws-default');
INSERT INTO public.tag_colors (tag, color, workspace_id) VALUES ('database', '#F97316', 'ws-default');
INSERT INTO public.tag_colors (tag, color, workspace_id) VALUES ('testing', '#06B6D4', 'ws-default');
INSERT INTO public.tag_colors (tag, color, workspace_id) VALUES ('docs', '#6B7280', 'ws-default');
INSERT INTO public.tag_colors (tag, color, workspace_id) VALUES ('urgent', '#DC2626', 'ws-default');
INSERT INTO public.tag_colors (tag, color, workspace_id) VALUES ('refactor', '#EC4899', 'ws-default');

-- Starter task templates
INSERT INTO public.task_templates (id, name, description, default_status, default_priority, default_project, default_assigned_to, default_tags, is_default, workspace_id) VALUES ('tpl-bug-report', 'Bug Report', 'Steps to reproduce:\n1. \n\nExpected behavior:\n\nActual behavior:\n', 'INBOX', 'HIGH', NULL, NULL, ARRAY['bug']::text[], true, 'ws-default');
INSERT INTO public.task_templates (id, name, description, default_status, default_priority, default_project, default_assigned_to, default_tags, is_default, workspace_id) VALUES ('tpl-feature-request', 'Feature Request', 'User story:\nAs a [user], I want [feature] so that [benefit].\n\nAcceptance criteria:\n- [ ] \n', 'IDEA', 'MEDIUM', NULL, NULL, ARRAY['feature']::text[], true, 'ws-default');
INSERT INTO public.task_templates (id, name, description, default_status, default_priority, default_project, default_assigned_to, default_tags, is_default, workspace_id) VALUES ('tpl-tech-debt', 'Tech Debt / Refactor', 'Current state:\n\nDesired state:\n\nRisks:\n', 'IDEA', 'LOW', NULL, NULL, ARRAY['refactor']::text[], true, 'ws-default');
