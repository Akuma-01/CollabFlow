-- Apply after schema.sql on a new database, or directly to an existing database.
-- Additive and safe to rerun; existing users/projects/tasks are preserved.
BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_sessions (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL CHECK (refresh_token_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON public.auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON public.auth_sessions(expires_at);

COMMIT;
