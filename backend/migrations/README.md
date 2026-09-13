# Database migrations

`schema.sql` is the baseline for the original four application tables. Apply the
numbered SQL files in this directory in filename order after loading that baseline
on a new database. Existing databases only need the new migration files.

For this checkpoint, apply `001_auth_sessions.sql` **before** starting the new API:

```sh
# From the repository root, with DATABASE_URL already set in your shell:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/migrations/001_auth_sessions.sql
```

Alternatively use the standard PostgreSQL `PGHOST`, `PGPORT`, `PGUSER`,
`PGPASSWORD`, and `PGDATABASE` environment variables and omit `"$DATABASE_URL"`.
The shell does not automatically load `backend/.env`.

For a new database, first run `psql` with the same connection settings and
`-v ON_ERROR_STOP=1 -f backend/schema.sql`, then apply the migration above.
`001_auth_sessions.sql` uses a transaction and can be rerun. It adds a table and
indexes without changing existing users, projects, memberships, or tasks.
Integration test setup applies the baseline and all numbered SQL files to each
disposable test database, including a regression test for reapplying migration 001.

## Rollout behavior

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
