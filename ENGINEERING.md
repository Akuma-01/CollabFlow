# CollabFlow engineering walkthrough

CollabFlow is a TypeScript project-management application with a Next.js frontend,
an Express API, and PostgreSQL. Its engineering focus is keeping authentication,
authorization, activity history, and browser state consistent when people work
on the same project concurrently.

## Resume bullets supported by this repository

- Built a TypeScript/Express collaboration API with four project roles,
  resource-scoped authorization, and persisted refresh sessions supporting token
  rotation, replay detection, and per-session revocation.
- Implemented transactional PostgreSQL activity logging and project-row locking
  with permission rechecks; tested rollback behavior, cross-project isolation,
  and concurrent task and membership changes against real PostgreSQL.
- Added authenticated WebSocket updates using PostgreSQL notifications and
  browser reconciliation after writes and reconnects; verified collaboration
  with two independent browser sessions in GitHub Actions.

These describe implemented behavior. Test counts describe coverage breadth, not
user adoption or measured performance. There are no measured latency, throughput,
availability, or real-user adoption claims. Comments and background notification
workers are not implemented. Production verification is tracked separately in
the [deployment guide](backend/DEPLOYMENT.md#release-verification).

## Where to inspect the implementation

| Concern | Code to read | Evidence |
| --- | --- | --- |
| Project roles and resource isolation | [Role middleware](backend/middlewares/hasRole.middleware.ts), [project transactions](backend/utils/projectTransaction.ts) | [RBAC](backend/__tests__/rbac.test.ts), [cross-project isolation](backend/__tests__/isolation.test.ts) |
| Session rotation and revocation | [Session service](backend/services/sessions.service.ts), [browser API client](frontend/lib/api.ts) | [Session races and replay](backend/__tests__/sessions.test.ts), [refresh coordination](frontend/test/api.test.ts) |
| Atomic activity and permission rechecks | [Task service](backend/services/tasks.service.ts), [activity service](backend/services/activity.service.ts) | [Mutation, rollback, and permission races](backend/__tests__/task-member-activity.test.ts) |
| Authorized change delivery across API instances | [Notifications](backend/realtime/notifications.ts), [listener](backend/realtime/listener.ts), [WebSocket server](backend/realtime/server.ts) | [Real WebSocket and PostgreSQL tests](backend/__tests__/realtime.test.ts) |
| Browser convergence and access loss | [Synchronization coordinator](frontend/lib/project-sync.ts), [project UI](frontend/app/projects/[projectId]/ProjectClient.tsx) | [Controlled browser races](frontend/e2e/realtime.spec.ts), [live two-browser collaboration](frontend/e2e-live/collaboration.spec.ts) |
| Startup and recovery | [HTTP runtime](backend/runtime/server.ts), [health checks](backend/runtime/health.ts) | [Runtime integration tests](backend/__tests__/runtime.test.ts), [compiled-entry-point smoke check](backend/test/startup-smoke.cjs) |

## Design decisions to explain in an interview

**Authorization is checked again after waiting for the project lock.** A request
can pass route middleware and then wait while another transaction removes its
actor's permissions. Each existing-project mutation locks the project row, reads
current permissions in a new statement, then changes data. Tests hold the row
lock until PostgreSQL reports the request waiting, change membership, and verify
the queued write is rejected. This gives deterministic regression coverage for
a race that ordinary sequential endpoint tests would miss.

**A business change, its activity records, and its notification share a
transaction.** If an activity insert fails, the change rolls back. This includes
member removal and every automatic task unassignment it causes. Notifications
become visible after commit, so browsers do not refresh in response to a change
that later rolls back. The cost is serializing mutations within one project;
the [activity contract](backend/ACTIVITY.md) explains that tradeoff.

**The WebSocket carries a hint to refetch authorized state.** It does not carry
task contents or an event replay log. Each API instance listens to PostgreSQL and
notifies its own authenticated project rooms, with membership/session checks
before delivery. A disconnected client refetches after joining again. The browser
also invalidates reads overtaken by local writes or newer hints and reconciles
after pending writes settle. This provides eventual convergence; it does not
provide offline editing, conflict-free merging, or exactly-once event delivery.

**Authentication has server-side state so revocation is enforceable.** Every
protected request checks the persisted session. Refresh locks that session row
and replaces the saved token digest; replay revokes the session. Browser requests
coordinate refresh within a tab and, when available, across tabs with Web Locks.
Strict replay rejection means a lost rotation response or an uncoordinated client
can require a new login. See [authentication details](backend/ARCHITECTURE.md#authentication-and-authorization).

**Local tests and hosted verification prove different things.** Disposable
PostgreSQL tests cover SQL, transactions, and API behavior; controlled browser
tests create reproducible timing failures; the live browser test checks the
complete local path. Public-domain cookies, provider TLS, and HTTPS/WSS ingress
still need a hosted check. Per-process rate limits and configured connection
caps are safeguards, not a capacity benchmark.

## Five-minute demo

Use the [local setup](README.md#setup) with two accounts in separate browser
profiles, or use the deployed environment after its release checks pass. Separate
profiles keep login cookies independent; two ordinary tabs share a session.

1. As the owner, create a project and add the second account as an editor. Open
   that project in both profiles and show **Live updates connected**.
2. Open an unfinished task form in the editor's profile. Create a task as the
   owner and show that the other board updates while preserving the editor's
   unfinished text.
3. Open **Activity** as the owner. Move and assign the task as the editor; show
   the owner's board counts and history updating without a manual refresh.
4. Disconnect and reconnect one browser through its developer tools. Make a
   change while it is offline; show the recovered view fetching current state.
5. From an owner-authenticated API client, change the editor's role to viewer
   using `PATCH /projects/:projectId/members/:userId` with `{"role":"viewer"}`;
   show editing controls disappear in the editor's browser. Then `DELETE` the
   same member endpoint; show the project view clear and report loss of access.
   Role changes and removal currently use the API; the UI lists and adds members.

For a repeatable automated demonstration, run from the repository root with
Node.js 20.x and Docker available:

```sh
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix frontend run test:e2e:install
docker compose -f compose.test.yml up -d --wait
npm --prefix frontend run test:e2e:live
docker compose -f compose.test.yml stop
```

The live suite creates its own users and database on the disposable test server.
It covers steps 1–3 and 5 plus logout revocation. Reconnect behavior is covered by
the controlled browser tests and remains part of the manual hosted demo. See
[frontend testing](frontend/TESTING.md) for port requirements and restoring the
normal frontend build after browser tests.

## Verification record

Commit [`ac75e81`](https://github.com/Akuma-01/CollabFlow/commit/ac75e81521febbdd5fb296bab166095659099514)
passed both jobs in [GitHub Actions run 34996076969](https://github.com/Akuma-01/CollabFlow/actions/runs/34996076969),
created on 2026-09-15 and verified on 2026-09-16. The backend job ran the integration
suite and compiled production startup check. The frontend job ran lint, unit
tests, the controlled Chromium suite, and the live collaboration suite, including
their production builds.

At the local deployment milestone, verification reported 245 backend tests,
22 frontend unit tests, 26 controlled Chromium tests, and one live collaboration
test. Refer to the linked CI run and current test runners when quoting results
for a later commit; these numbers are a dated record, not a coverage percentage.

On 2026-09-16, the public login page returned 200, while the Render API returned
404 for both new health endpoints. Hosted authentication and collaboration for
this release remain unverified. A green CI run does not establish that Render is
running the same commit.
