# CollabFlow — Architecture Overview

## System Design
CollabFlow is an academic project collaboration platform for student teams 
and faculty mentors. Students can create project workspaces, divide tasks 
among team members, and track progress. Faculty guides can monitor 
contributions and review milestones. The backend is built with Node.js, 
Express, PostgreSQL, and JWT authentication using a layered architecture 
that separates routing, business logic, and data access.

## HTTP Request Lifecycle
HTTP application requests pass through the following layers in order:

1. **Router** — matches the URL to the correct route handler (auth, projects, tasks)
2. **Auth Middleware** — validates the access JWT from its cookie or Bearer header,
   checks the persisted session, and attaches current user details to `req.user`
3. **Role Middleware** — queries `project_members` and `projects` tables to verify 
   the user has sufficient role for that route (owner, editor, viewer, or guide)
4. **Controller** — validates request inputs and calls the appropriate service
5. **Service** — executes SQL via a connection pool; project mutations recheck
   authorization after acquiring the project lock and write history atomically
6. **Error Middleware** — catches any error from any layer and returns a consistent 
   JSON error response

## Database Design
Four project-management tables (`users`, `projects`, `project_members`, `tasks`)
plus `auth_sessions` for authentication and `activity_logs` for project history.
New tables are introduced through
[additive SQL migrations](migrations/README.md) after the baseline `schema.sql`.

- `project_members` references both `projects` and `users` via foreign keys
- `tasks` references both `projects` and `users` (for assigned_to and created_by)
- `auth_sessions` references `users` and is deleted when its user is deleted
- `activity_logs` belongs to a project and snapshots the actor's name; actor
  deletion nulls its user reference, while project deletion removes its history

Key constraint decisions:
- `project_members.project_id` → ON DELETE CASCADE: deleting a project removes 
  all membership records automatically
- `project_members.user_id` → ON DELETE RESTRICT: a user cannot be deleted while 
  they are an active project member
- `tasks.project_id` → ON DELETE CASCADE: deleting a project removes its tasks
- `tasks.assigned_to` and `tasks.created_by` → ON DELETE SET NULL: deleting a 
  user nullifies their task references rather than deleting the tasks themselves
- `tasks.status` → CHECK constraint enforcing only 'todo', 'in_progress', or 'done'

## Authentication and Authorization
Authentication uses JWT tokens issued on login. Passwords are hashed with 
bcrypt before storage — plain text passwords are never stored. On login, 
the provided password is compared against the stored hash. If valid, a 
signed access JWT is set in an HttpOnly cookie with a 15-minute expiry, alongside
a 7-day refresh-token cookie signed with a separate secret. Access tokens can
also be supplied as Bearer tokens. Every protected route passes
through auth middleware which verifies the signature, HS256 algorithm, token type,
and session claims. It then joins the active session to the user. This replaces
the old user-existence query rather than adding another database round trip.

Each login creates an independent session with a random UUID and a seven-day
absolute expiry. The database stores a SHA-256 digest of the current refresh
token. Each refresh token has a random token ID and carries a signed session ID.
Refresh locks that session row with `SELECT ... FOR UPDATE`, compares the digest,
and replaces it in a transaction before issuing cookies. The new refresh cookie
retains the original expiry. Replaying a correctly signed predecessor revokes the
entire session; revocation is committed before returning 401. This follows the
rotation/replay model described in [RFC 9700, section 4.14.2](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2).

Logout revokes the presented session before clearing cookies. An older rotated
refresh token can identify the session for logout, with a valid access token as
a fallback. Every protected request checks that session, so copied access tokens
also stop working after logout or replay revocation. Requests already authorized
before revocation may finish. Other device logins remain active. Database failures
return a server error instead of being disguised as invalid credentials.

The frontend shares one pending refresh among parallel requests and coordinates
cookie-changing requests across tabs using the [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
It rechecks `/auth/me` under the lock, then refreshes only if still needed. Login
and logout use the same lock, and original API requests retry at most once. Without
Web Locks, serialization is limited to the current tab; competing tabs or external
clients can trigger strict replay revocation and require a new login. A response
lost after rotation commits can also require signing in again; there is no grace
period accepting a previously consumed token.

Auth POSTs check browser Origin against `FRONTEND_URL`, which protects refresh
and logout from cross-origin form submissions when cookies use SameSite=None.
Session responses and authenticated reads use `Cache-Control: no-store`.

Role checks query current project membership, so role changes and removals take
effect without waiting for access tokens to expire. Assigned-task listings also
check current project access.

Authorization is enforced by the `hasRole` middleware. It accepts an array 
of allowed roles and checks whether the requesting user is the project owner 
(via `projects.owner_id`) or holds a qualifying role in `project_members`. 
Owners bypass the membership check entirely. This allows route-level 
permission control with a single reusable middleware.
Mutating services also check current permissions under a project row lock so a
queued request cannot act on a role that changed after middleware ran.

## Key Design Decisions

Project, task, membership, and role changes write activity records in the same
transaction as the mutation. Existing-project mutations lock the project row
first, then check permissions and read the prior state. This serializes writes
within a project while allowing different projects to change concurrently. It
keeps before/after history accurate and prevents assignment races with member
removal or role changes. Removing members or making them guides also clears and
audits their project task assignments atomically.

A read-only history endpoint uses project-scoped, indexed cursor pagination.
See [the activity API](ACTIVITY.md) for event schemas, locking tradeoffs, and
retention rules. The project's Activity view renders saved snapshots with filtered
pagination. Each filter/refresh mounts a new feed, discarding prior pagination
state and ignoring late responses; the shared API client handles session refresh.

Project mutations also issue PostgreSQL notifications inside their transactions.
Each API process holds a dedicated LISTEN connection and sends small refresh hints
to authenticated WebSocket project rooms after commit. Before delivery, it batches
session and membership checks for each room. Logout/replay revocation closes the
affected session's sockets; heartbeat checks and token-expiry timers cover idle
connections. Listener failure disconnects consumers and reconnects with backoff.
The browser integration is the next checkpoint. See [the WebSocket protocol](REALTIME.md)
for delivery guarantees, resource limits, and deployment requirements.

**1. ON DELETE CASCADE for project-related data**
When a project is deleted, all associated members and tasks are automatically 
removed. Keeping orphaned records would create data inconsistency and serve 
no product purpose in a collaboration tool.

**2. Role-based authorization via reusable middleware**
The `hasRole` middleware handles route authorization. Mutations use the shared
`withProjectTransaction` helper for a second check under the project lock.
Controllers pass the authenticated actor ID to services; future permission
changes must update both route and transaction policies.

**3. Owner stored in projects table, not project_members**
Ownership is a property of the project itself. Storing it in `project_members` 
would duplicate the fact across two tables, creating risk of update anomalies 
where the two sources contradict each other. The `hasRole` middleware handles 
this by checking `project.owner_id` before querying `project_members`.

## Known Constraints and Future Improvements
- Students (non-guide members) should be restricted to one active project 
  at a time, matching real university policy. Currently not enforced.
- Faculty guides can supervise multiple projects.
- Future: add project status (active/archived) and enforce single-project 
  constraint per student on active projects.
