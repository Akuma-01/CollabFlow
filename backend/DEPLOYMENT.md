# API deployment and operation

The API needs a long-running Node process and a PostgreSQL connection that
supports `LISTEN`. HTTP and WebSockets share the port supplied by the host.
This guide prepares a deployment; no hosted environment is provisioned by these
files. Apply the [database migrations](migrations/README.md) before releasing.

The selected production setup is:

| Component | Host | Public address |
| --- | --- | --- |
| Frontend | Vercel | https://collabflow-wine.vercel.app |
| HTTP API and WebSockets | Render | https://collabflow-backend-1d4q.onrender.com |
| PostgreSQL | Supabase | Private configuration in Render's environment settings |

## Configuration

Copy `.env.example` to `.env` for local development. Both the TypeScript entry
point and compiled `dist/server.js` read `backend/.env`; environment variables
provided by the host take precedence. `.env` is never a build artifact to publish.

| Variable | Behavior |
| --- | --- |
| `NODE_ENV` | Set `production` on the deployed API for Secure authentication cookies. |
| `PORT` | Host-assigned TCP port, default `3000`; integer from 1 through 65535. Listens on `0.0.0.0`. |
| `FRONTEND_URL` | One browser origin, e.g. `https://app.example.com`. Production requires HTTPS. No path, query, or credentials. A trailing slash is normalized consistently for HTTP, auth POSTs, and WebSockets. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Two different randomly generated secrets; production requires at least 32 characters each. |
| `TRUST_PROXY_HOPS` | Number of trusted reverse proxies between the client and API, default `0` for direct access. |
| `DATABASE_URL` | PostgreSQL URL; takes precedence over the discrete `DB_*` connection fields. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` | Alternative connection fields. Port defaults to `5432`. |
| `DB_SSL_MODE` | `verify-full` or `disable`. Defaults to `verify-full` for a URL, `disable` for discrete local settings. |
| `DB_SSL_CA_FILE` | Optional readable PEM CA certificate file for verified TLS, using an absolute path. |

Generate each signing secret independently, for example with `openssl rand -hex
32`, then store it in the host's secret configuration. Configuration errors name
the invalid setting without printing its value.

Match `TRUST_PROXY_HOPS` to the actual routing topology. For one trusted ingress,
use `1` and prevent clients from reaching the backend directly. The proxy must
overwrite forwarding headers. Different-length routes can make a numeric hop
count unsafe; see [Express proxy configuration](https://expressjs.com/en/guide/behind-proxies/).
Authentication rate limiting remains in memory per API process; multiple replicas
do not share a global limit.

## PostgreSQL TLS and connection mode

Previous versions disabled certificate verification for URL connections. This
version verifies the certificate and hostname. If the provider uses its own CA,
mount that CA and configure `DB_SSL_CA_FILE`; do not disable verification to work
around an untrusted certificate. Use `DB_SSL_MODE=disable` only when plaintext is
appropriate for your local or private database network.

Remove `ssl`, `sslmode`, `sslrootcert`, `sslcert`, `sslkey`, and `uselibpqcompat`
query parameters from `DATABASE_URL`; configure TLS with the fields above. This
avoids [node-postgres URL parsing overriding the TLS configuration](https://node-postgres.com/features/ssl).
An existing provider URL containing `sslmode=require` must be updated before
starting this release. A certificate/hostname mismatch now prevents startup.

Use a direct PostgreSQL endpoint or a session-pooling proxy. A transaction-pooling
endpoint cannot preserve the notification listener's subscription. The request
pool has a maximum of ten connections by default, plus one dedicated listener
per API process. Leave database capacity for migrations, administration, and
other replicas.

Connection acquisition times out after five seconds. PostgreSQL statements and
idle transactions time out after ten seconds. Database restarts can fail active
requests; failed idle connections are discarded without crashing the process.
These limits apply to the API; the separate `psql` migration commands retain
their own timeout settings.

## Start and check

From the repository root:

```sh
npm --prefix backend ci
npm --prefix backend run build
NODE_ENV=production npm --prefix backend start
```

Supply the configuration above before the final command. Startup verifies the
required baseline/session/activity tables and subscribes to both notification
channels before accepting HTTP traffic. Invalid configuration, missing migrations,
database connection failures, and occupied ports result in a nonzero exit. An
occupied port also closes the already-started notification connection.

Startup errors identify the failing stage (`database`, `realtime`, or `http`)
and a recognized error code, followed by corrective guidance. For example:

```text
API startup failed [database/42P01]: Required database tables or columns are missing. Apply migrations 001 and 002 to the configured database and check its schema/search_path.
```

| Code | Check |
| --- | --- |
| `42P01`, `42703` | Apply missing migrations to the database the API actually uses; confirm the schema/search path. |
| `SELF_SIGNED_CERT_IN_CHAIN` and other certificate codes | Verify the endpoint's certificate chain and configure its CA file when needed. |
| `28P01`, `28000` | Check database credentials, the pooler username, and URL password encoding. |
| `ENETUNREACH`, `ENOTFOUND`, connection timeouts | Check reachability/DNS and direct versus session-pooler settings. |
| `53300` | Check database connection capacity, including the dedicated notification listener. |
| `EADDRINUSE` | Ensure only one process binds the configured HTTP port. |
| `UNKNOWN` | Use the reported stage to investigate provider settings and logs. |

Diagnostics use recognized codes and fixed messages. They do not print raw driver
errors, connection URLs, queries, certificate details, or original error stacks.
The missing-schema codes follow [PostgreSQL SQLSTATE definitions](https://www.postgresql.org/docs/16/errcodes-appendix.html).

| Endpoint | Purpose | Response |
| --- | --- | --- |
| `GET /health/live` | Process can answer HTTP. No database query. | `200 {"status":"ok"}` |
| `GET /health/ready` | API can serve traffic with PostgreSQL and the notification listener available. | `200 {"status":"ready"}` or `503 {"status":"not_ready"}` |

Both endpoints are unauthenticated and return `Cache-Control: no-store`, with no
database names, credentials, schema details, or error stacks in the response.
Concurrent readiness requests share one database probe. The probe has a two-second
query deadline, in addition to the pool's five-second acquisition timeout.
Listener loss returns 503 immediately; readiness recovers after resubscription
and a successful database probe. Where the host supports separate probes, use
readiness for routing and liveness for process restart decisions so a database
outage does not repeatedly restart the API. Render uses one health-check path
for both purposes, as described below.

SIGTERM/SIGINT mark the API unready, stop new connections, close WebSockets and
the listener, let active HTTP responses finish, and end the database pool. A
ten-second process deadline bounds shutdown; work still running then can be
interrupted. Give the hosting process at least that much termination time. Node's
[HTTP close operation](https://nodejs.org/docs/latest-v20.x/api/http.html#serverclosecallback)
drains HTTP; the application explicitly closes upgraded WebSocket connections.

## Hosting configuration

### Vercel frontend

Vercel is the selected frontend host. Import this repository with these settings:

| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | Next.js |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Leave the Next.js default |
| Production environment variable | `NEXT_PUBLIC_API_URL=https://collabflow-backend-1d4q.onrender.com` |

The root directory selects this repository's frontend application; see
[Vercel's monorepo setup](https://vercel.com/docs/monorepos). Keep database
credentials and JWT secrets on the API host. The browser's public API URL is
[embedded at build time](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser),
so changing it requires a new frontend deployment.

On Render, set `FRONTEND_URL=https://collabflow-wine.vercel.app`, without `/login`.
This value controls CORS, authentication POSTs, and WebSocket Origin checks.
Preview deployments require a backend configured for their exact origin;
generated preview URLs are not automatically authorized.

### Render API

Configure the existing Render **Web Service** for the backend:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root Directory | `backend` |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health/ready`, once this release is deployed |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://collabflow-wine.vercel.app` |
| `DB_SSL_MODE` | `verify-full` |
| `DATABASE_URL` | The Supabase direct or session-pooler URL described below |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Keep existing values if distinct and at least 32 characters each |
| `TRUST_PROXY_HOPS` | Actual trusted ingress count; `1` for a single proxy, subject to the proxy checks above |

The build explicitly installs development dependencies because TypeScript is
needed to compile the API, even with `NODE_ENV=production`. Let Render supply
`PORT`; the server listens on that port on `0.0.0.0`. HTTP and WebSockets use the
same service and port. See Render's [Node deployment](https://render.com/docs/deploy-node-express-app)
and [WebSocket guidance](https://render.com/docs/websocket). Changing signing
secrets invalidates existing tokens, so replace them only when needed.

Render accepts a healthy HTTP response within five seconds and uses the same
check for deployment readiness and running-instance health. With `/health/ready`,
a prolonged database or notification-listener outage can also cause an instance
restart. `/health/live` remains useful for diagnosing whether the process can
respond. See [Render health checks](https://render.com/docs/health-checks).

### Supabase PostgreSQL

In the Supabase project, open **Connect** and copy the **Session pooler** URL on
port `5432` for an IPv4-compatible persistent connection. Its format is:

```text
postgresql://postgres.<project-ref>:<encoded-password>@<pooler-host>:5432/postgres
```

Copy the actual host and username from the dashboard; percent-encode reserved
characters in the database password. A direct connection on port `5432` also
works when Render can reach its address; Supabase's default direct endpoint uses
IPv6 unless the IPv4 add-on is enabled. See [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres).

CollabFlow requires persistent `LISTEN` subscriptions, so use session mode or a
direct connection. Transaction-pooler endpoints on port `6543` do not preserve
that session state. The API and its notification listener currently share the
same connection configuration.

Keep `DB_SSL_MODE=verify-full` and remove the URL TLS parameters listed above.
If the chosen endpoint's certificate needs Supabase's project CA, download that
CA from the project's database SSL settings. Upload it to Render as a secret
file named `supabase-ca.crt` and set
`DB_SSL_CA_FILE=/etc/secrets/supabase-ca.crt`. Leave this variable unset when the
endpoint's certificate already validates against Node's trusted CAs; the project
CA and a pooler's certificate chain may differ. See [Supabase SSL configuration](https://supabase.com/docs/guides/platform/ssl-enforcement).

Render can save environment changes with **Save only** for the next deployment;
saving a secret file triggers a deployment. Coordinate these changes with the
release. See [Render environment variables and secret files](https://render.com/docs/configure-environment-variables).

### Release order

1. Commit the completed local milestone, then prepare the existing Render service
   settings above before pushing to a branch that triggers automatic deployment.
2. Apply any unapplied [numbered migrations](migrations/README.md) to Supabase.
   The existing database does not need the baseline `schema.sql` reapplied.
   For `psql`, configure `PGSSLMODE=verify-full` and, if needed, `PGSSLROOTCERT`;
   the API's `DB_SSL_*` variables do not configure `psql`.
3. Deploy the new backend commit with its updated environment. Check that
   `/health/live` returns `200` and `/health/ready` returns `200` before switching
   Render's Health Check Path to `/health/ready`. The old deployed API returns
   `404` for these paths, so changing the check prematurely makes it unhealthy.
4. Redeploy Vercel with the production `NEXT_PUBLIC_API_URL` above and complete
   the browser checks below. Confirm the hosted CI run for the released commit.

### Release verification

Build the frontend with `NEXT_PUBLIC_API_URL` set to the public API origin. Set
the API's `FRONTEND_URL` to the exact browser origin. Terminate HTTPS at the trusted
ingress and forward WebSocket upgrades on `/projects/:projectId/events` to the
same API port. Allow connections to remain open across the server's 30-second
heartbeat interval. The frontend uses WSS when its API URL uses HTTPS.

After a release, verify sign-in, token refresh, and logout in a browser on the
actual domains; production cookies are HttpOnly, Secure, and SameSite=None.
Cross-site cookie restrictions depend on the browser and hosting arrangement.
Open one project in two independent sessions, move a task, verify the other
board/history updates, then check reconnect and member removal. See the
[WebSocket contract](REALTIME.md) for guarantees and connection limits.

Read-only public checks on **2026-09-15**, before this release:

| Check | Observed result |
| --- | --- |
| Vercel `/login` | Page served with the title `CollabFlow` |
| Render `/` | `200` |
| Render `/auth/me` without cookies | `401` |
| Render `/health/live` and `/health/ready` | Both `404`; new health routes are not deployed |
| API CORS headers for the Vercel origin | Exact allowed origin and `Access-Control-Allow-Credentials: true` |

These checks confirm public reachability and the CORS response. Authenticated
browser flows, production database TLS, and WebSocket collaboration still need
verification after the release. No hosted settings or data were changed by these
checks.

On **2026-09-16**, the login page again returned 200 and both API health endpoints
still returned 404. Commit `ac75e81` is pushed to `main`; both jobs in
[CI run 34996076969](https://github.com/Akuma-01/CollabFlow/actions/runs/34996076969)
passed, including the startup smoke check and live two-browser suite. The public
API does not yet expose this commit's health routes. Render logs subsequently
confirmed that this commit built successfully but exited during runtime startup.
The owner confirmed that migrations 001 and 002 had not been applied. Apply them
to the same Supabase project used by Render, then retry the deployment. The old
generic error does not rule out an additional TLS or connection-mode problem;
stage-specific diagnostics make a subsequent failure actionable. Hosted
deployment verification remains open.

## Verification available in this repository

```sh
docker compose -f compose.test.yml up -d --wait
npm --prefix backend test -- --runInBand
npm --prefix backend run test:startup
npm --prefix frontend run test:e2e:live
docker compose -f compose.test.yml stop
```

`test:startup` builds the API and starts the real compiled entry point with
`NODE_ENV=production` against a fresh disposable test database. It verifies a
chosen `PORT`, readiness, production cookie flags, authenticated WebSockets,
SIGTERM cleanup, safe missing-migration diagnostics, and rejection of invalid
configuration. The live browser suite
also uses the deployed startup path and waits for readiness. Both run in CI.

These checks use local HTTP and plaintext test PostgreSQL. They do not validate a
provider's certificates, public HTTPS/WSS ingress, DNS, real-domain browser cookie
policies, or hosting limits. Hosted deployment and its smoke checks remain a
separate release step.
