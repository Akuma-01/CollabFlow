# CollabFlow

A full-stack academic project collaboration platform for college student teams and faculty mentors. Students can create project workspaces, divide tasks among team members, and track progress. Faculty guides can monitor contributions and review milestones.

## Tech Stack
- Node.js + Express 5
- TypeScript
- PostgreSQL
- WebSockets (`ws`) with PostgreSQL notifications
- JWT Authentication + bcrypt
- Zod validation
- Rate limiting

## Project Structure
```
collabflow/
  backend/
    config/         # DB and env configuration
    controllers/    # HTTP layer — request/response handling
    middlewares/    # Auth, role, validation, error handling
    routes/         # Route definitions
    realtime/       # Authenticated project subscriptions and PostgreSQL listener
    schemas/        # Zod validation schemas
    services/       # Business logic and DB queries
    types/          # TypeScript interfaces and types
    server.ts       # Entry point
```

## Setup
1. Clone the repo
2. Copy `backend/.env.example` to `backend/.env` and fill in values
3. Prepare PostgreSQL with `backend/schema.sql` and the numbered
   [database migrations](backend/migrations/README.md)
4. Run `npm install` inside `backend/`
5. Run `npm run dev` to start development server

## Environment Variables
```
JWT_SECRET=
JWT_REFRESH_SECRET=
DB_USER=
DB_HOST=
DB_DATABASE=
DB_PASSWORD=
DB_PORT=
FRONTEND_URL=http://localhost:3001
```

## Tests and CI

The backend uses Jest and Supertest against real PostgreSQL. Each run creates a
fresh database from `backend/schema.sql` and the numbered migrations, covering
authentication, role boundaries, cross-project isolation, transactional activity
history, and concurrent mutations.

```sh
docker compose -f compose.test.yml up -d --wait
npm --prefix backend ci
npm --prefix backend test -- --runInBand
```

See [backend/TESTING.md](backend/TESTING.md) for isolation safeguards, focused test
commands and coverage limits. GitHub Actions runs backend tests and builds, plus
frontend API-client tests, lint, and Chromium tests of the production build on
pushes and pull requests. See [frontend/TESTING.md](frontend/TESTING.md) for browser
setup and coverage.

## Project Activity

Open **Activity** beside the project board to see task, membership, role, and
project changes with actor names, timestamps, and before/after values. All project
roles can read history. Filter by event type, load older events, or refresh for
new changes. History survives task deletion and member removal; project deletion
removes its history. See [the activity contract](backend/ACTIVITY.md) for the API,
transaction guarantees, and retention rules.

The backend also exposes authenticated WebSocket project subscriptions at
`/projects/:projectId/events`. Committed mutations notify subscribers across API
instances through PostgreSQL; session and membership checks guard delivery.
Browser integration is the next checkpoint. See [the WebSocket contract](backend/REALTIME.md)
for connection rules, failure recovery, and the limits of notification delivery.

## API Endpoints

### Auth
- `POST /auth/register` — register a new user
- `POST /auth/login` — login and receive JWT token
- `GET /auth/me` — get current authenticated user
- `POST /auth/refresh` — rotate the refresh token and issue an access token
- `POST /auth/logout` — revoke the current session and clear authentication cookies

### Projects
- `GET /projects` — get all projects for logged in user
- `POST /projects` — create a new project
- `GET /projects/:projectId` — get project details with task counts
- `PATCH /projects/:projectId` — update project title
- `DELETE /projects/:projectId` — delete project
- `GET /projects/:projectId/activity` — paginated project, task, membership, and role history

### Members
- `GET /projects/:projectId/members` — list project members
- `POST /projects/:projectId/members` — add a member (editor or viewer)
- `PATCH /projects/:projectId/members/:userId` — update member role
- `DELETE /projects/:projectId/members/:userId` — remove a member
- `POST /projects/:projectId/guides` — assign a faculty guide

### Tasks
- `GET /projects/:projectId/tasks` — get tasks (filterable by status and assignee)
- `POST /projects/:projectId/tasks` — create a task
- `PATCH /projects/:projectId/tasks/:id` — update task title/description/deadline
- `DELETE /projects/:projectId/tasks/:id` — delete a task
- `PATCH /projects/:projectId/tasks/:id/assign` — assign task to a member
- `PATCH /projects/:projectId/tasks/:id/status` — update task status

### Dashboard
- `GET /dashboard` — all projects with role and task counts for logged in user
- `GET /dashboard/tasks` — all tasks assigned to logged in user ordered by deadline

### Users
- `GET /users` — list all users (used for member search)

## Roles
| Role | Description |
|------|-------------|
| owner | Full control — manages members, tasks, and project settings |
| editor | Can create, update, and delete tasks |
| viewer | Read-only access to project data |
| guide | Faculty mentor — read-only access, cannot modify anything |

## Database Schema
- `users` — id, name, email, password
- `projects` — id, title, owner_id
- `project_members` — user_id, project_id, role
- `tasks` — id, title, description, project_id, assigned_to, created_by, status, deadline, created_at
- `auth_sessions` — id, user_id, refresh_token_hash, created_at, expires_at, revoked_at
- `activity_logs` — project/actor, action, entity, JSONB metadata, timestamp;
  see [activity API and transaction rules](backend/ACTIVITY.md)

## Key Design Decisions
- Owner stored in `projects.owner_id`, not in `project_members` — avoids update anomalies
- `project_members.project_id` uses ON DELETE CASCADE — deleting a project cleans up members
- `project_members.user_id` uses ON DELETE RESTRICT — users cannot be deleted while active members
- `tasks.assigned_to` uses ON DELETE SET NULL — deleting a user unassigns their tasks
- Role-based authorization via reusable `hasRole` middleware
- Refresh-token rotation uses transactional row locks; replay and logout revoke
  the current session's access and refresh tokens without ending other device logins

## Planned Improvements

- **Real-time browser updates** — connect the board and Activity view to the implemented
  WebSocket transport, with reconnect handling and optimistic-state reconciliation
- **Comment system** — faculty guides need a way to leave feedback on tasks or milestones beyond
  read-only access; a `task_comments` table with role-gated write access covers this
- **College email verification** — domain-based access control (e.g. only `@university.edu`
  addresses can register) to keep workspaces institution-scoped
- **Project cover images** — file upload for a project thumbnail; needs a storage backend
  (S3 or equivalent) before this makes sense to implement

## Potential Directions

- **Project showcase** — a public discovery feed where teams can publish completed projects,
  with upvoting and filtering by domain/tech stack
- **University leaderboard** — contribution tracking across projects, ranked by institution;
  requires careful thought about what "contribution" means fairly
- **Public project profiles** — shareable project pages for portfolios, visible without login
