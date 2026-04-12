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
2. **Auth Middleware** — validates the JWT token from the Authorization header 
   and attaches the decoded user to `req.user`
3. **Role Middleware** — queries `project_members` and `projects` tables to verify 
   the user has sufficient role for that route (owner, editor, or viewer)
4. **Controller** — validates request inputs and calls the appropriate service
5. **Service** — executes raw SQL queries against PostgreSQL via a connection pool
6. **Error Middleware** — catches any error from any layer and returns a consistent 
   JSON error response

## Database Design
Four core tables: `users`, `projects`, `project_members`, and `tasks`.

- `project_members` references both `projects` and `users` via foreign keys
- `tasks` references both `projects` and `users` (for assigned_to and created_by)

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
signed JWT is returned with a 1 hour expiry. Every protected route passes 
through auth middleware which verifies the token and attaches the decoded 
user to `req.user`.

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
