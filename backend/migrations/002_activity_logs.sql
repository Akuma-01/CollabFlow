BEGIN;

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id BIGSERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('project', 'task', 'member')),
    entity_id INTEGER NOT NULL,
    metadata JSONB NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS activity_logs_project_id_id_idx
    ON public.activity_logs(project_id, id DESC);
CREATE INDEX IF NOT EXISTS activity_logs_project_action_id_idx
    ON public.activity_logs(project_id, action, id DESC);

COMMIT;
