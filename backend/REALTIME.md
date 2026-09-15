# Project WebSocket protocol

This checkpoint adds the server transport and PostgreSQL integration tests.
Connecting the browser board and Activity view is the next checkpoint; they still
use their existing HTTP/manual-refresh behavior for now. No new migration is
required beyond the session and activity migrations.

## Connecting

Open a WebSocket on the API origin:

```text
wss://api.example.com/projects/7/events
```

One connection subscribes to one project. Browsers send the HttpOnly `token`
cookie automatically, subject to the deployment's cookie policy. Non-browser
clients may send `Authorization: Bearer <access token>`. Both require an `Origin`
header that exactly matches the origin of `FRONTEND_URL`. Query parameters,
including query-string tokens, are rejected. Refresh tokens cannot authenticate
this endpoint.

The upgrade verifies the existing access JWT, live persisted session, and current
project ownership/membership. Owners, editors, viewers, and guides may subscribe.
The service checks again after entering the room, closing the race with a
membership change during upgrade. Missing/invalid authentication returns HTTP
401; untrusted origins and inaccessible projects return 403. Invalid endpoint
paths return 404, query parameters return 400, and exhausted connection capacity
returns 429. A recovering notification listener returns 503 before upgrade.

## Messages

After authorization and room registration, the first data message is:

```json
{ "type": "project.ready", "projectId": 7 }
```

Fetch current project, task, membership, and activity state **after** this message.
Subscribing before that fetch avoids a gap between fetching and joining the room.

Committed project changes produce:

```json
{ "type": "project.changed", "projectId": 7 }
```

This is a hint to refetch current authorized HTTP resources. It does not contain
task content, member details, a mutation acknowledgement, or a replay cursor.
Clients must coalesce refreshes and reconcile them with pending optimistic writes.
Multiple rapid notifications may be combined; a notification is not a count of
mutations. The durable Activity API remains the source for detailed history.

Clients send mutations through the existing REST API. Sending application frames
on a WebSocket closes it with code 1008, so clients cannot broadcast forged
events or switch rooms. Browser WebSocket implementations answer protocol-level
ping frames automatically; no application heartbeat message is needed.

## Commit and authorization boundaries

The activity logger calls `pg_notify` on the mutation's transaction client.
Project deletion does so before committing its cascading delete. PostgreSQL
delivers these notifications only after commit and folds identical notifications
within one transaction. A member removal with several automatic unassignments
therefore produces one project hint. Rollbacks, rejected writes, and unchanged
operations produce none. See the [PostgreSQL notification semantics](https://www.postgresql.org/docs/16/sql-notify.html).

Each API process maintains a dedicated `LISTEN` connection, independent of the
HTTP query pool. This allows processes connected to the same database to deliver
changes to their own subscribers. No Redis or in-process-only publisher is used.
The listener must connect directly to PostgreSQL, or through a session-pooling
proxy that preserves its connection; transaction-pooling proxies do not provide
the persistent session this design requires.

Before each delivery, the server batches session and membership checks for that
room. Removed members receive no further hints after a check observes the removal.
Checks authorize a database snapshot; as with an HTTP read, a revocation racing
after that snapshot cannot retract a hint already sent. The subsequent HTTP fetch
enforces access independently. Membership changes and project deletion trigger
rechecks, closing connections that have lost access.

Logout and refresh-token replay publish session-revocation notifications in the
same database operation as revocation. Other logins remain connected. Access-token
expiry has a timer, and the heartbeat also rechecks database permissions to catch
session expiry or administrative changes that bypass notifications.

## Disconnects and recovery

| Close code | Meaning / client behavior |
| --- | --- |
| `4001` | Access token expired or session invalid. Restore authentication through the HTTP client before reconnecting; show login if it fails. |
| `4003` | Project access lost or project deleted. Clear project state and leave the project view. |
| `1008` | Unsupported client application message. Fix the client protocol. |
| `1009` | Incoming frame exceeds the 1 KiB limit. |
| `1013` | Notification/authorization service unavailable or consumer too slow. Reconnect with backoff and refetch after `project.ready`. |
| Abnormal/network close | Reconnect with backoff and refetch; do not assume all hints were delivered. |

Notifications are not durable delivery. A disconnected listener or client misses
hints; there is no replay or exactly-once guarantee. Listener loss disconnects
all its consumers so the gap is explicit. It retries from 500 ms, doubling to a
30-second maximum, and rejects new upgrades until both channels are subscribed.
Startup fails if the initial listener cannot connect.

Default resource limits per API process: 1,000 connections, 10 per login session,
128 pending upgrade authentications with a five-second handshake timeout, 1 KiB
incoming frames, and a 64 KiB outgoing-buffer threshold. Protocol pings run every
30 seconds; a peer that fails to answer is terminated on the next tick. Compression
is disabled. These limits are safeguards for team-sized workspaces, not a load
benchmark or a substitute for deployment-level connection/rate limits.

## Running and testing

`npm run dev` and `npm start` start HTTP and WebSockets on the existing API port
3000. A reverse proxy must forward HTTP Upgrade/Connection headers and allow
long-lived connections; use HTTPS/WSS in deployment. Set `FRONTEND_URL` to the
actual browser origin. SIGTERM/SIGINT stop upgrades, disconnect peers, close the
listener, drain HTTP requests, and end the query pool (ten-second shutdown limit).

```sh
npm --prefix backend test -- --runInBand realtime
npm --prefix backend run build
```

The suite uses real HTTP servers, `ws` clients, and the disposable PostgreSQL
database. It covers role/origin/session boundaries, project isolation, every
mutation family, commit/rollback behavior, bulk-operation coalescing, session and
membership revocation, expiry, heartbeat, frame/connection limits, multiple API
servers, and notification-listener recovery. See [test setup](TESTING.md).

Direct SQL changes do not generate project hints automatically. New API mutations
must participate in the activity/notification transaction protocol. Browser
subscription, reconnect UX, optimistic reconciliation, and comment events remain
future work; comments are not implemented in the application yet.
