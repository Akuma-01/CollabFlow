# CollabFlow — Architecture Overview

## System Design
[2-3 sentences on what the system does and the overall approach]
The project is meant to keep the information of projects, the members and tasks of the project. 
A logged in user can create project, add members to the project along with the roles which they play. Furthermore the owner or ther editors both can assign tasks to other members working on the project.

## Request Lifecycle
Every request passes through the following layers in order:

1. **Router** — matches the URL to the correct route handler (auth, projects, tasks)
2. **Auth Middleware** — validates the JWT token from the Authorization header and attaches the decoded user to `req.user`
3. **Role Middleware** — queries `project_members` and `projects` tables to verify the user has sufficient role for that route (owner, editor, or viewer)
4. **Controller** — validates request inputs and calls the appropriate service
5. **Service** — executes raw SQL queries against PostgreSQL via a connection pool
6. **Error Middleware** — catches any error from any layer and returns a consistent JSON error response

## Database Design
[Key tables, relationships, and intentional decisions like CASCADE vs RESTRICT]
ket tables are projects which consist of the projects being currently worked on by the members who are stored in a table called project_members doing a task on the project which is stored in the tasks table.

if a row from projects get deleted, the rows on other tables also gets deleted where the project_id is being refernced as CASCADE, but not in Restrict

## Authentication and Authorization
[How JWT auth works, how role-based access is enforced]
in every route, if the authentication is required there is the auth middleware presnt which checks the credentials of the current user and if valied it is store dto req.user such that it can be used in anywhere without calling any external source

role based accesss(authorization) is being enforced by the hasRole middleware which gets added to the route and given the roles which are authorized to make  request


## Key Design Decisions
[2-3 decisions you made consciously and why]
cascading of deletion of a project
adding a role based middleware
