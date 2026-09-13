# CollabFlow — Architecture Overview

## System Design
CollabFlow is an academic project collaboration platform for student teams 
and faculty mentors. Students can create project workspaces, divide tasks 
among team members, and track progress. Faculty guides can monitor 
contributions and review milestones. The backend is built with Node.js, 
Express, PostgreSQL, and JWT authentication using a layered architecture 
that separates routing, business logic, and data access.

## Request Lifecycle
Every request passes through the following layers in order:

1. **Router** — matches the URL to the correct route handler (auth, projects, tasks)
2. **Auth Middleware** — validates the access JWT from its cookie or Bearer header,
   checks the persisted session, and attaches current user details to `req.user`
3. **Role Middleware** — queries `project_members` and `projects` tables to verify 
   the user has sufficient role for that route (owner, editor, viewer, or guide)
4. **Controller** — validates request inputs and calls the appropriate service
5. **Service** — executes raw SQL queries against PostgreSQL via a connection pool
6. **Error Middleware** — catches any error from any layer and returns a consistent 
   JSON error response

## Database Design
Four project-management tables (`users`, `projects`, `project_members`, `tasks`)
and `auth_sessions` for authentication. New tables are introduced through
[additive SQL migrations](migrations/README.md) after the baseline `schema.sql`.

- `project_members` references both `projects` and `users` via foreign keys
- `tasks` references both `projects` and `users` (for assigned_to and created_by)
- `auth_sessions` references `users` and is deleted when its user is deleted

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

## Key Design Decisions

**1. ON DELETE CASCADE for project-related data**
When a project is deleted, all associated members and tasks are automatically 
removed. Keeping orphaned records would create data inconsistency and serve 
no product purpose in a collaboration tool.

**2. Role-based authorization via reusable middleware**
Rather than checking roles inside each controller, a single `hasRole` 
middleware handles all authorization. This keeps controllers clean and makes 
permission changes a one-line update in the route file.

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
