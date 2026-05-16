# CollabFlow

A full-stack academic project collaboration platform for college student teams and faculty mentors. Students can create project workspaces, divide tasks among team members, and track progress. Faculty guides can monitor contributions and review milestones.

## Tech Stack
- Node.js + Express 5
- TypeScript
- PostgreSQL
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
    schemas/        # Zod validation schemas
    services/       # Business logic and DB queries
    types/          # TypeScript interfaces and types
    server.ts       # Entry point
```

## Setup
1. Clone the repo
2. Copy `backend/.env.example` to `backend/.env` and fill in values
3. Run `npm install` inside `backend/`
4. Run `npm run dev` to start development server

## Environment Variables
```
JWT_SECRET=
DB_USER=
DB_HOST=
DB_DATABASE=
DB_PASSWORD=
DB_PORT=
```

## API Endpoints

### Auth
- `POST /auth/register` — register a new user
- `POST /auth/login` — login and receive JWT token
- `GET /auth/me` — get current authenticated user

### Projects
- `GET /projects` — get all projects for logged in user
- `POST /projects` — create a new project
- `GET /projects/:projectId` — get project details with task counts
- `PATCH /projects/:projectId` — update project title
- `DELETE /projects/:projectId` — delete project

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

## Key Design Decisions
- Owner stored in `projects.owner_id`, not in `project_members` — avoids update anomalies
- `project_members.project_id` uses ON DELETE CASCADE — deleting a project cleans up members
- `project_members.user_id` uses ON DELETE RESTRICT — users cannot be deleted while active members
- `tasks.assigned_to` uses ON DELETE SET NULL — deleting a user unassigns their tasks
- Role-based authorization via reusable `hasRole` middleware

## Planned Improvements

- **Real-time notifications** — WebSocket events for task assignments, status changes, and new
  members so collaborators don't need to refresh manually
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
