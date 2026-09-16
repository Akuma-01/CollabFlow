# Database migrations

`schema.sql` is the baseline for the original four application tables. Apply the
numbered SQL files in this directory in filename order after loading that baseline
on a new database. Existing databases only need the new migration files.

## Existing Supabase database

Open the SQL Editor in the **same Supabase project used by Render**. Run the full
contents of [001_auth_sessions.sql](001_auth_sessions.sql), then
[002_activity_logs.sql](002_activity_logs.sql), checking that each succeeds.
These migrations preserve existing users, projects, memberships, and tasks. Do
not reload the baseline `schema.sql` onto the existing database.

This read-only query confirms that both tables exist; a `NULL` result means that
table is still missing:

```sql
SELECT to_regclass('public.auth_sessions') AS auth_sessions,
       to_regclass('public.activity_logs') AS activity_logs;
```

Retry the Render deployment after both migrations succeed. API startup checks
required columns and the notification listener before accepting requests.
The session migration requires existing users to sign in again; see below.

## Applying migrations with psql

Apply any unapplied migrations **before** starting the new API:

```sh
# From the repository root, with DATABASE_URL already set in your shell:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/migrations/001_auth_sessions.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/migrations/002_activity_logs.sql
```

Alternatively use the standard PostgreSQL `PGHOST`, `PGPORT`, `PGUSER`,
`PGPASSWORD`, and `PGDATABASE` environment variables and omit `"$DATABASE_URL"`.
The shell does not automatically load `backend/.env`.

For a new database, first run `psql` with the same connection settings and
`-v ON_ERROR_STOP=1 -f backend/schema.sql`, then apply the migrations above.
Both migrations use transactions and can be rerun. They add tables and indexes
without changing existing users, projects, memberships, or tasks.
Integration test setup applies the baseline and all numbered SQL files to each
disposable test database, including regression tests for reapplying both migrations.

Migration 002 introduces [project activity](../ACTIVITY.md). It does not backfill
historical events, and it does not change authentication sessions. If migration
001 is already deployed, only 002 is needed for this checkpoint.

## Session migration rollout (001)

Deploy the API and frontend changes together after applying the migration. Old
access and refresh tokens have no persisted session and are rejected; existing
users must sign in again. The new frontend coordinates refresh requests so normal
parallel requests do not reuse an already rotated token.

Configure separate, random `JWT_SECRET` and `JWT_REFRESH_SECRET` values, and set
`FRONTEND_URL` to the browser application's origin. Authentication POSTs with an
Origin header accept only that configured origin; non-browser API clients may
omit the header. Production cookies remain HttpOnly and Secure with SameSite=None.

## Session retention

Sessions expire seven days after login. Token rotation does not extend this
deadline. Expiry and revocation are checked on every authenticated request;
removing expired database rows is not required to enforce expiry. A periodic
maintenance task can prune expired rows using:

```sql
DELETE FROM public.auth_sessions WHERE expires_at <= NOW();
```

Only token hashes are stored. There is one row per login, not one row per token
rotation. Deleting a user cascades to that user's sessions.
