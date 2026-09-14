# Project activity API

Project, task, membership, and role changes are recorded with their database
mutations. The frontend feed will follow in a separate checkpoint. Existing
history is not backfilled.

## Reading history

```http
GET /projects/:projectId/activity?limit=20&before=42&action=PROJECT_UPDATED
```

All current project roles can read history. Outsiders and removed members receive
403; missing authentication receives 401. The SQL query also checks current access
so a membership change between middleware and query execution cannot expose rows.
There are no endpoints for clients to create, edit, or delete activity records.

Query parameters are optional:

| Parameter | Meaning |
| --- | --- |
| `limit` | Page size, 1–100; defaults to 20 |
| `before` | Return events with a lower ID than this positive bigint cursor |
| `action` | Filter by one of the event actions below |

Unknown parameters, duplicate parameters, invalid action values, and out-of-range
limits/cursors return 400. Responses use `Cache-Control: no-store`.

```json
{
  "success": true,
  "data": [{
    "id": "42",
    "project_id": 7,
    "actor_id": 3,
    "actor_name": "Alice",
    "action": "PROJECT_UPDATED",
    "entity_type": "project",
    "entity_id": 7,
    "metadata": {
      "from": { "title": "Prototype" },
      "to": { "title": "Release" }
    },
    "created_at": "2026-09-13T12:00:00.000Z"
  }],
  "nextCursor": null
}
```

IDs and cursors remain decimal strings to preserve BIGSERIAL precision. Results
are ordered by descending ID. When more matching rows exist, `nextCursor` is the
last returned ID; otherwise it is null. Keep the same filter on subsequent pages.
New records arriving after page one do not shift older pages. Refresh without a
cursor to see newer records. An empty history returns `data: []` and a null cursor.

## Events

Each record includes the authenticated actor's ID/name, the project ID, an entity
type and ID, and the following metadata. Member entity IDs are user IDs. Person
snapshots contain `{ id, name }`; they do not include email addresses.

| Action | Entity | Metadata |
| --- | --- | --- |
| `PROJECT_CREATED` | project | `title` |
| `PROJECT_UPDATED` | project | `from: { title }`, `to: { title }` |
| `TASK_CREATED` | task | `title`, initial `status`, `deadline`, `assignee` snapshot or null |
| `TASK_UPDATED` | task | Current `title`, `changes` mapping each changed field to `{ from, to }` |
| `TASK_MOVED` | task | `title`, `from` status, `to` status |
| `TASK_ASSIGNED` | task | `title`, `from` and `to` person snapshots or null; optional `reason` |
| `TASK_DELETED` | task | Last `title` and `status` |
| `MEMBER_ADDED` | member | `member` snapshot, initial `role` |
| `MEMBER_REMOVED` | member | `member` snapshot, previous `role` |
| `ROLE_CHANGED` | member | `member` snapshot, `from` role, `to` role |

Task edits track `title`, `description`, and `deadline`. Deadlines in metadata are
calendar dates (`YYYY-MM-DD`) or null. Statuses are `todo`, `in_progress`, and
`done`; membership roles are `editor`, `viewer`, and `guide`. Owners are stored
separately and cannot have their role changed through membership endpoints.

Adding a guide also emits `MEMBER_ADDED`: the current API adds existing users
directly, with no pending invitation workflow. Creation records an initial task
assignee in `TASK_CREATED`, without a separate assignment event.

Removing a member or changing their role to `guide` clears their task assignments
in that project. Each cleared task receives `TASK_ASSIGNED` with `to: null` and
`reason: "member_removed"` or `"role_changed"`. The membership event and all
unassignment events commit together. Assignments in other projects are unaffected;
viewers remain eligible for assignment. These operations enforce the rule going
forward; this release does not repair historical assignments automatically.

## Transaction and retention rules

Every recorded mutation and its log inserts use the same checked-out PostgreSQL
client and transaction. Any log insert failure rolls back the entire operation,
including prior log inserts and automatic unassignments. Metadata is selected by
the service, not copied from the request body.

All mutations of an existing project lock its project row first, including project
deletion. The service then reads current permissions in a separate statement and
validates assignees inside the transaction. A request that passed middleware before
a membership change must still be authorized when it obtains the lock. Concurrent
edits form accurate before/after chains, and partial edits preserve other fields.
Requests that repeat current field values, status, assignment, or role succeed
without adding history. Invalid and rejected requests add no history.

This deliberately serializes writes within a project, keeping membership rules
and history consistent at the scale of a student team. Different projects can
change concurrently, and ordinary reads do not take this row lock. High write
volume in one project would require revisiting lock granularity. New mutation
services must follow the same locking protocol; direct database edits bypass it
and do not create activity automatically.

Actor names are snapshots at the time of the action. Deleting an actor sets its
reference to null while retaining the name. Task titles and member/assignee names
remain readable after the referenced task or user is deleted. Deleting a project
cascades to its history. Database administrators can change these records; this
is not a tamper-evident compliance archive, and project deletion does not retain
a deletion event elsewhere.

Apply [migration 002](migrations/002_activity_logs.sql) before starting this API
version on an existing database. It adds the activity table and project/cursor and
project/action/cursor indexes without modifying existing application records.
Task/member events use that same schema; no additional migration is needed.
