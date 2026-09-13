# Backend testing

Run from the repository root with Node.js 20.x and Docker Compose:

```sh
docker compose -f compose.test.yml up -d --wait
npm --prefix backend ci
npm --prefix backend test -- --runInBand
npm --prefix backend run build
```

Stop the disposable database server when finished:

```sh
docker compose -f compose.test.yml down
```

PostgreSQL 16 runs on `127.0.0.1:55432` and uses temporary storage. It is
independent of your development database. To use a different port, set
`TEST_DB_PORT` for both Compose and Jest. An existing **test server** can also
be selected using `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, and
`TEST_DB_PASSWORD`; these override the checked-in defaults in `.env.test`.
The default PostgreSQL role can create/drop databases and apply `schema.sql`
(which contains ownership statements for the `postgres` role).

## Isolation and lifecycle

Jest global setup creates a database named `collabflow_test_<random suffix>`
and applies the real `schema.sql` plus the numbered SQL migrations. The Express application and all test queries
use that database. Ordinary `DATABASE_URL`, `DB_*`, and `.env` settings do not
select the test server; JWT signing uses test-only secrets. The database module
rejects test connections without the generated database name.

Integration suites use `test/helpers.ts` to reset the application tables, including sessions,
before each test and close the application's connection pool afterward. Suites
run serially within a Jest invocation; do not override this with multiple
workers or `test.concurrent`, since suites share that invocation's database.
Separate Jest invocations get separate databases and can run concurrently.
Global teardown drops only the generated database, including after assertion
failures. If a process is forcibly killed, stop the temporary Docker server to
discard its remaining databases.

Fixtures register/login through the API and assert setup responses, so setup
failures surface immediately. Authentication, service queries, constraints,
and HTTP handlers run without mocks in integration tests. `hasRole.test.ts`
is a separate set of focused middleware unit tests with a mocked service.

## Coverage

The backend suite currently passes **100 PostgreSQL integration tests and 6
middleware unit tests** (106 total). The frontend has **11 API-client tests**.

- Authentication: password hashing, duplicate and concurrent registration,
  validation, cookie flags and token lifetimes, cookies/Bearer access,
  expired/malformed/incorrectly signed tokens, access/refresh token separation,
  fresh user data on refresh, deleted users, and browser logout.
- Sessions: hashed token storage, independent logins, fixed session expiry,
  rotation, replay revocation, concurrent refreshes, copied-token rejection after
  logout, logout/refresh races, invalid claims, user-deletion cleanup, migration
  reapplication, database-write rollback, and browser Origin checks.
- RBAC: actual `owner`, `editor`, `viewer`, and `guide` permissions through HTTP;
  owner protection, task workflows, membership management, and immediate role
  changes with existing access cookies.
- Isolation: private project reads and listings; mismatched project/task IDs
  for edits, moves, assignment and deletion; membership mutations; external
  assignees; removal of access to assigned tasks after membership removal.
- Concurrency: simultaneous registration, member addition, and guide addition
  assert both response outcomes and persisted uniqueness.

Run one area while developing:

```sh
npm --prefix backend test -- --runInBand isolation
npm --prefix backend run test:watch -- auth
```

## CI and remaining work

`.github/workflows/ci.yml` runs the same integration tests against a PostgreSQL
service and builds the backend on pushes and pull requests. A second job lints
tests and builds the frontend. No application or deployment secrets are needed.

The frontend API-client tests exercise the actual client with controlled fetch
responses and a shared-lock simulation: concurrent requests, independent tabs,
delayed 401s, logout ordering, refresh errors, and preservation of mutation bodies.
They do not replace real-browser end-to-end tests.

```sh
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

Authentication rate limiting is disabled in the integration environment and is
not covered by this suite. Audit logs, comments, and WebSockets need tests when
implemented. Existing databases require the [session migration](migrations/README.md)
before starting this version; users with legacy tokens must sign in again.
